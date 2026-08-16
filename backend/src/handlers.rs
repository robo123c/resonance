use crate::lyrics;
use crate::models::*;
use crate::scanner::Scanner;
use crate::scrobble::{self, ScrobbleService};
use crate::updater;
use crate::ws::WsClients;
use actix_web::http::header::{HeaderName, HeaderValue};
use actix_web::{web, HttpRequest, HttpResponse};
use argon2::{Argon2, PasswordVerifier, password_hash::{PasswordHash, PasswordHasher, SaltString, rand_core::OsRng}};
use parking_lot::Mutex;
use rand::seq::SliceRandom;
use rand::Rng;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct AppState {
    pub db: SqlitePool,
    pub scanner: Arc<Mutex<Scanner>>,
    pub ws_clients: Arc<WsClients>,
    pub cast_targets: Arc<Mutex<HashMap<String, CastTarget>>>,
}

pub async fn get_libraries(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let libraries = sqlx::query_as::<_, Library>("SELECT * FROM libraries ORDER BY name")
        .fetch_all(&data.db)
        .await;

    match libraries {
        Ok(libs) => HttpResponse::Ok().json(libs),
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn create_library(
    data: web::Data<AppState>,
    body: web::Json<CreateLibraryRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = uuid::Uuid::new_v4().to_string();
    let result = sqlx::query("INSERT INTO libraries (id, name, path) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&body.name)
        .bind(&body.path)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => {
            let library = sqlx::query_as::<_, Library>("SELECT * FROM libraries WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match library {
                Ok(lib) => HttpResponse::Created().json(lib),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn delete_library(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();

    let exists = sqlx::query_scalar::<_, i64>("SELECT 1 FROM libraries WHERE id = ?")
        .bind(&id)
        .fetch_optional(&data.db)
        .await;

    match exists {
        Ok(Some(_)) => {}
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "Library not found"}));
        }
        Err(e) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": e.to_string()}));
        }
    }

    // Library removal only detaches the library from Resonance. The configured
    // directory belongs to the user and must never be deleted by an API request.
    // Foreign-key cascades remove the library's indexed metadata below.
    let result = sqlx::query("DELETE FROM libraries WHERE id = ?")
        .bind(&id)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn scan_library(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }

    let library_id = path.into_inner();

    let library = sqlx::query_as::<_, Library>("SELECT * FROM libraries WHERE id = ?")
        .bind(&library_id)
        .fetch_one(&data.db)
        .await;

    let library = match library {
        Ok(lib) => lib,
        Err(_) => {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "Library not found"}))
        }
    };

    // Guard against concurrent scans of the same library
    {
        let scanner = data.scanner.lock();
        if scanner.is_scanning(&library_id) {
            return HttpResponse::Conflict()
                .json(serde_json::json!({"error": "Library is already being scanned"}));
        }
    }

    let start = std::time::Instant::now();

    let scanner = data.scanner.lock();
    let state = scanner.scan_library(library_id.clone(), library.path.clone());
    let is_scanning = state.is_scanning.clone();
    let files_found = state.files_found.clone();
    let files_processed = state.files_processed.clone();
    let files_skipped = state.files_skipped.clone();
    let errors = state.errors.clone();
    drop(state);
    drop(scanner);

    let db = data.db.clone();
    let lib_id = library_id.clone();
    let lib_path = library.path.clone();
    let ws_clients = data.ws_clients.clone();

    tokio::spawn(async move {
        sqlx::query("UPDATE libraries SET is_scanning = TRUE WHERE id = ?")
            .bind(&lib_id)
            .execute(&db)
            .await
            .ok();

        sqlx::query(
            "INSERT OR REPLACE INTO scan_progress (library_id, files_found, files_processed, files_skipped, errors, is_complete, started_at) VALUES (?, 0, 0, 0, 0, FALSE, datetime('now'))"
        )
        .bind(&lib_id)
        .execute(&db)
        .await
        .ok();

        let files = Scanner::collect_files(&lib_path);
        files_found.store(files.len() as i32, std::sync::atomic::Ordering::Relaxed);

        let scan_state = crate::scanner::LibraryScanState {
            is_scanning: is_scanning.clone(),
            files_found: files_found.clone(),
            files_processed: files_processed.clone(),
            files_skipped: files_skipped.clone(),
            errors: errors.clone(),
        };

        let tracks = Scanner::scan_files_parallel(files, &lib_id, &scan_state);

        let mut tx = match db.begin().await {
            Ok(tx) => tx,
            Err(e) => {
                log::error!("scan_library transaction begin failed: {}", e);
                sqlx::query("UPDATE libraries SET is_scanning = FALSE WHERE id = ?")
                    .bind(&lib_id)
                    .execute(&db)
                    .await
                    .ok();
                return;
            }
        };

        for track in &tracks {
            let _ = sqlx::query(
                r#"INSERT OR REPLACE INTO tracks (
                    id, title, artist, album, album_artist, genre, year, track_number,
                    disc_number, duration_ms, file_path, file_name, file_size, file_modified,
                    format, sample_rate, bit_depth, bitrate, channels, codec, composer,
                    lyricist, mood, bpm, rating, play_count, skip_count, last_played,
                    date_added, has_artwork, artwork_hash, lyrics, comment, grouping,
                    copyright, custom_tags, folder, library_id, fingerprint, waveform_peaks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
            )
            .bind(&track.id)
            .bind(&track.title)
            .bind(&track.artist)
            .bind(&track.album)
            .bind(&track.album_artist)
            .bind(&track.genre)
            .bind(track.year)
            .bind(track.track_number)
            .bind(track.disc_number)
            .bind(track.duration_ms)
            .bind(&track.file_path)
            .bind(&track.file_name)
            .bind(track.file_size)
            .bind(&track.file_modified)
            .bind(&track.format)
            .bind(track.sample_rate)
            .bind(track.bit_depth)
            .bind(track.bitrate)
            .bind(track.channels)
            .bind(&track.codec)
            .bind(&track.composer)
            .bind(&track.lyricist)
            .bind(&track.mood)
            .bind(track.bpm)
            .bind(track.rating)
            .bind(track.play_count)
            .bind(track.skip_count)
            .bind(&track.last_played)
            .bind(&track.date_added)
            .bind(track.has_artwork)
            .bind(&track.artwork_hash)
            .bind(&track.lyrics)
            .bind(&track.comment)
            .bind(&track.grouping)
            .bind(&track.copyright)
            .bind(&track.custom_tags)
            .bind(&track.folder)
            .bind(&track.library_id)
            .bind(&track.fingerprint)
            .bind(&track.waveform_peaks)
            .execute(&mut *tx)
            .await
            .ok();
        }

        if let Err(e) = tx.commit().await {
            log::error!("scan_library transaction commit failed for {}: {}", lib_id, e);
            sqlx::query("UPDATE libraries SET is_scanning = FALSE WHERE id = ?")
                .bind(&lib_id)
                .execute(&db)
                .await
                .ok();
            return;
        }

        sqlx::query("UPDATE libraries SET is_scanning = FALSE, track_count = ?, last_scan = datetime('now') WHERE id = ?")
            .bind(tracks.len() as i32)
            .bind(&lib_id)
            .execute(&db)
            .await
            .ok();

        sqlx::query(
            "UPDATE scan_progress SET files_processed = ?, is_complete = TRUE WHERE library_id = ?",
        )
        .bind(files_processed.load(std::sync::atomic::Ordering::Relaxed))
        .bind(&lib_id)
        .execute(&db)
        .await
        .ok();

        // Broadcast scan completion via WebSocket
        let processed = files_processed.load(std::sync::atomic::Ordering::Relaxed);
        let found = files_found.load(std::sync::atomic::Ordering::Relaxed);
        crate::ws::broadcast_scan_progress(&ws_clients, &lib_id, found, processed, true).await;

        let elapsed = start.elapsed().as_secs_f64();
        log::info!("Library scan completed in {:.1}s", elapsed);
    });

    // Broadcast scan start via WebSocket
    let ws = data.ws_clients.clone();
    let lib_id_ws = library_id.clone();
    tokio::spawn(async move {
        crate::ws::broadcast_scan_progress(&ws, &lib_id_ws, 0, 0, false).await;
    });

    HttpResponse::Ok().json(serde_json::json!({
        "message": "Scan started",
        "library_id": library_id,
    }))
}

pub async fn get_scan_progress(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let library_id = path.into_inner();
    let scanner = data.scanner.lock();

    match scanner.get_progress(&library_id) {
        Some((found, processed, skipped, errors, is_scanning)) => {
            HttpResponse::Ok().json(serde_json::json!({
                "files_found": found,
                "files_processed": processed,
                "files_skipped": skipped,
                "errors": errors,
                "is_scanning": is_scanning,
            }))
        }
        None => HttpResponse::Ok().json(serde_json::json!({
            "files_found": 0,
            "files_processed": 0,
            "files_skipped": 0,
            "errors": 0,
            "is_scanning": false,
        })),
    }
}

pub async fn get_tracks(data: web::Data<AppState>, query: web::Query<QueryParams>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let per_page = query.per_page.unwrap_or(50).min(500);

    let mut where_clauses = vec!["1=1".to_string()];
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref artist) = query.artist {
        where_clauses.push("artist = ?".to_string());
        binds.push(artist.clone());
    }
    if let Some(ref album) = query.album {
        where_clauses.push("album = ?".to_string());
        binds.push(album.clone());
    }
    if let Some(ref genre) = query.genre {
        where_clauses.push("genre = ?".to_string());
        binds.push(genre.clone());
    }
    if let Some(year) = query.year {
        where_clauses.push("year = ?".to_string());
        binds.push(year.to_string());
    }
    if let Some(ref folder) = query.folder {
        where_clauses.push("folder LIKE ?".to_string());
        binds.push(format!("{}%", folder));
    }
    if let Some(ref mood) = query.mood {
        where_clauses.push("mood = ?".to_string());
        binds.push(mood.clone());
    }
    if let Some(min_rating) = query.min_rating {
        where_clauses.push("rating >= ?".to_string());
        binds.push(min_rating.to_string());
    }

    let where_str = where_clauses.join(" AND ");
    let count_query = format!("SELECT COUNT(*) FROM tracks WHERE {}", where_str);

    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query);
    for bind in &binds {
        count_q = count_q.bind(bind);
    }
    let total = count_q.fetch_one(&data.db).await.unwrap_or(0);

    let sort = query.sort.as_deref().unwrap_or("date_added");
    let order = query.order.as_deref().unwrap_or("DESC");
    let allowed_sorts = [
        "id",
        "title",
        "artist",
        "album",
        "year",
        "date_added",
        "duration_ms",
        "play_count",
        "rating",
        "genre",
    ];
    let sort_col = if allowed_sorts.contains(&sort) {
        sort
    } else {
        "date_added"
    };
    let order_dir = if order.to_uppercase() == "ASC" {
        "ASC"
    } else {
        "DESC"
    };

    let use_keyset = query.last_id.is_some() && sort_col == "id";

    let tracks = if use_keyset {
        let last_id = query.last_id.as_ref().unwrap();
        let op = if order_dir == "ASC" { ">" } else { "<" };
        let sql = format!(
            "SELECT * FROM tracks WHERE id {} ? AND {} ORDER BY id {} LIMIT {}",
            op, where_str, order_dir, per_page
        );
        let mut q = sqlx::query_as::<_, Track>(&sql);
        q = q.bind(last_id);
        for bind in &binds {
            q = q.bind(bind);
        }
        q.fetch_all(&data.db)
            .await
            .unwrap_or_default()
    } else {
        let page = query.page.unwrap_or(1).max(1);
        let offset = (page - 1) * per_page;
        let sql = format!(
            "SELECT * FROM tracks WHERE {} ORDER BY {} {} LIMIT {} OFFSET {}",
            where_str, sort_col, order_dir, per_page, offset
        );
        let mut q = sqlx::query_as::<_, Track>(&sql);
        for bind in &binds {
            q = q.bind(bind);
        }
        q.fetch_all(&data.db)
            .await
            .unwrap_or_default()
    };

    let total_pages = (total as f64 / per_page as f64).ceil() as i32;
    let page = query.page.unwrap_or(1).max(1);

    HttpResponse::Ok().json(PaginatedResponse {
        items: tracks,
        total,
        page,
        per_page,
        total_pages,
    })
}

pub async fn get_track(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    match track {
        Ok(t) => HttpResponse::Ok().json(t),
        Err(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "Track not found"})),
    }
}

pub async fn update_track(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<UpdateTrackRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();

    let mut updates = vec![];

    if body.title.is_some() {
        updates.push("title = ?");
    }
    if body.artist.is_some() {
        updates.push("artist = ?");
    }
    if body.album.is_some() {
        updates.push("album = ?");
    }
    if body.genre.is_some() {
        updates.push("genre = ?");
    }
    if body.year.is_some() {
        updates.push("year = ?");
    }
    if body.rating.is_some() {
        updates.push("rating = ?");
    }
    if body.mood.is_some() {
        updates.push("mood = ?");
    }
    if body.bpm.is_some() {
        updates.push("bpm = ?");
    }
    if body.lyrics.is_some() {
        updates.push("lyrics = ?");
    }

    if updates.is_empty() {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "No fields to update"}));
    }

    let sql = format!("UPDATE tracks SET {} WHERE id = ?", updates.join(", "));
    let mut query = sqlx::query(&sql);
    if body.title.is_some() {
        query = query.bind(&body.title);
    }
    if body.artist.is_some() {
        query = query.bind(&body.artist);
    }
    if body.album.is_some() {
        query = query.bind(&body.album);
    }
    if body.genre.is_some() {
        query = query.bind(&body.genre);
    }
    if body.year.is_some() {
        query = query.bind(body.year);
    }
    if body.rating.is_some() {
        query = query.bind(body.rating);
    }
    if body.mood.is_some() {
        query = query.bind(&body.mood);
    }
    if body.bpm.is_some() {
        query = query.bind(body.bpm);
    }
    if body.lyrics.is_some() {
        query = query.bind(&body.lyrics);
    }
    let result = query.bind(&id).execute(&data.db).await;

    match result {
        Ok(_) => {
            let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match track {
                Ok(t) => HttpResponse::Ok().json(t),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn play_track(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_optional(&data.db)
        .await
        .ok()
        .flatten();

    if let Some(track) = track {
        sqlx::query("UPDATE tracks SET play_count = play_count + 1, last_played = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&data.db)
            .await
            .ok();

        sqlx::query(
            "INSERT INTO listening_history (track_id, played_at) VALUES (?, datetime('now'))",
        )
        .bind(&id)
        .execute(&data.db)
        .await
        .ok();

        let db = data.db.clone();
        let track_id = track.id.clone();
        let artist = track.artist.clone();
        let title = track.title.clone();
        let album = track.album.clone();
        let timestamp = chrono::Utc::now().timestamp();

        tokio::spawn(async move {
            let service = ScrobbleService::new();
            service
                .update_now_playing(&db, &artist, &title, &album)
                .await;
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            service
                .scrobble(&db, &track_id, &artist, &title, &album, timestamp)
                .await;
            service.retry_pending_scrobbles(&db).await;
        });

        // Broadcast now playing via WebSocket
        let ws = data.ws_clients.clone();
        tokio::spawn(async move {
            crate::ws::broadcast_now_playing(&ws, &track).await;
        });
    }

    HttpResponse::Ok().json(serde_json::json!({"success": true}))
}

pub async fn stream_track(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    let track = match track {
        Ok(t) => t,
        Err(e) => {
            log::warn!("Stream: track not found {}: {}", id, e);
            return HttpResponse::NotFound().finish();
        }
    };

    let file_path = std::path::Path::new(&track.file_path);

    // Validate the file path is within a configured library directory
    match file_path.canonicalize() {
        Ok(canonical) => {
            let libraries = sqlx::query_as::<_, Library>("SELECT * FROM libraries")
                .fetch_all(&data.db)
                .await
                .unwrap_or_default();
            let allowed = libraries.iter().any(|lib| {
                PathBuf::from(&lib.path)
                    .canonicalize()
                    .map(|p| canonical.starts_with(&p))
                    .unwrap_or(false)
            });
            if !allowed {
                log::warn!("Stream: path outside libraries: {}", track.file_path);
                return HttpResponse::Forbidden()
                    .json(serde_json::json!({"error": "File path is outside configured libraries"}));
            }
        }
        Err(_) => {
            log::warn!("Stream: file not found: {}", track.file_path);
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "File not found"}));
        }
    }

    if !file_path.exists() {
        log::warn!(
            "Stream: file not found: {} (exists={})",
            track.file_path,
            file_path.exists()
        );
        return HttpResponse::NotFound()
            .json(serde_json::json!({"error": "File not found"}));
    }

    let mime = get_mime_type(&track.format);

    match actix_files::NamedFile::open(file_path) {
        Ok(f) => {
            let mut response = f.into_response(&req);
            response.headers_mut().insert(
                HeaderName::from_static("accept-ranges"),
                HeaderValue::from_static("bytes"),
            );
            response.headers_mut().insert(
                HeaderName::from_static("content-type"),
                HeaderValue::from_str(mime)
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            );
            response
        }
        Err(_) => HttpResponse::NotFound().finish(),
    }
}

pub async fn get_waveform(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();
    let result = sqlx::query_scalar::<_, Option<String>>("SELECT waveform_peaks FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    match result {
        Ok(Some(peaks_json)) => {
            let peaks: Vec<f32> = serde_json::from_str(&peaks_json).unwrap_or_default();
            HttpResponse::Ok().json(serde_json::json!({ "peaks": peaks }))
        }
        _ => HttpResponse::Ok().json(serde_json::json!({ "peaks": [] })),
    }
}

pub async fn get_artwork(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();

    let cached = sqlx::query_as::<_, (Vec<u8>, String)>(
        "SELECT artwork_data, mime_type FROM artwork_cache WHERE track_id = ?",
    )
    .bind(&id)
    .fetch_optional(&data.db)
    .await;

    if let Ok(Some((art_data, mime))) = cached {
        return HttpResponse::Ok().content_type(mime).body(art_data);
    }

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    let track = match track {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().finish(),
    };

    let file_path = std::path::Path::new(&track.file_path);
    if !file_path.exists() {
        return HttpResponse::NotFound().finish();
    }

    match crate::scanner::extract_artwork(file_path) {
        Ok(Some(artwork)) => {
            let mime = "image/jpeg".to_string();
            let _ = sqlx::query(
                "INSERT OR REPLACE INTO artwork_cache (track_id, artwork_data, mime_type, hash, cached_at) VALUES (?, ?, ?, '', datetime('now'))"
            )
            .bind(&id)
            .bind(&artwork)
            .bind(&mime)
            .execute(&data.db)
            .await;

            HttpResponse::Ok().content_type(mime).body(artwork)
        }
        _ => HttpResponse::NotFound().finish(),
    }
}

pub async fn get_albums(data: web::Data<AppState>, query: web::Query<QueryParams>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(500);
    let offset = (page - 1) * per_page;

    let sort = query.sort.as_deref().unwrap_or("date_added");
    let order = query.order.as_deref().unwrap_or("DESC");
    let sort_col = match sort {
        "title" => "title",
        "artist" => "artist",
        "year" => "year",
        "track_count" => "track_count",
        _ => "date_added",
    };
    let order_dir = if order.to_uppercase() == "ASC" {
        "ASC"
    } else {
        "DESC"
    };

    let sql = format!(
        "SELECT * FROM albums ORDER BY {} {} LIMIT {} OFFSET {}",
        sort_col, order_dir, per_page, offset
    );

    let albums = sqlx::query_as::<_, Album>(&sql)
        .fetch_all(&data.db)
        .await
        .unwrap_or_default();

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM albums")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);

    let total_pages = (total as f64 / per_page as f64).ceil() as i32;

    HttpResponse::Ok().json(PaginatedResponse {
        items: albums,
        total,
        page,
        per_page,
        total_pages,
    })
}

pub async fn get_artists(
    data: web::Data<AppState>,
    query: web::Query<QueryParams>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(500);
    let offset = (page - 1) * per_page;

    let sql = format!(
        "SELECT * FROM artists ORDER BY name ASC LIMIT {} OFFSET {}",
        per_page, offset
    );

    let artists = sqlx::query_as::<_, Artist>(&sql)
        .fetch_all(&data.db)
        .await
        .unwrap_or_default();

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM artists")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);

    let total_pages = (total as f64 / per_page as f64).ceil() as i32;

    HttpResponse::Ok().json(PaginatedResponse {
        items: artists,
        total,
        page,
        per_page,
        total_pages,
    })
}

pub async fn search(data: web::Data<AppState>, query: web::Query<SearchQuery>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let q = format!("%{}%", query.q.replace('\'', "''"));
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = query.offset.unwrap_or(0);

    let tracks = sqlx::query_as::<_, Track>(
        "SELECT * FROM tracks WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1 OR genre LIKE ?1 OR file_name LIKE ?1 OR folder LIKE ?1 OR lyrics LIKE ?1 ORDER BY play_count DESC LIMIT ?2 OFFSET ?3"
    )
    .bind(&q)
    .bind(limit)
    .bind(offset)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let albums = sqlx::query_as::<_, Album>(
        "SELECT * FROM albums WHERE title LIKE ?1 OR artist LIKE ?1 ORDER BY track_count DESC LIMIT ?2"
    )
    .bind(&q)
    .bind(limit / 2)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let artists = sqlx::query_as::<_, Artist>(
        "SELECT * FROM artists WHERE name LIKE ?1 ORDER BY track_count DESC LIMIT ?2",
    )
    .bind(&q)
    .bind(limit / 2)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let playlists = sqlx::query_as::<_, Playlist>(
        "SELECT * FROM playlists WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY name LIMIT ?2"
    )
    .bind(&q)
    .bind(limit / 2)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let total = tracks.len() as i64 + albums.len() as i64 + artists.len() as i64 + playlists.len() as i64;

    HttpResponse::Ok().json(SearchResults {
        tracks,
        albums,
        artists,
        playlists,
        total,
    })
}

pub async fn get_recently_played(
    data: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let limit: i64 = query.get("limit").and_then(|l| l.parse().ok()).unwrap_or(20).min(100);
    let tracks = sqlx::query_as::<_, Track>(
        "SELECT t.* FROM tracks t INNER JOIN listening_history lh ON t.id = lh.track_id GROUP BY t.id ORDER BY MAX(lh.played_at) DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();
    HttpResponse::Ok().json(tracks)
}

pub async fn get_most_played(
    data: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let limit: i64 = query.get("limit").and_then(|l| l.parse().ok()).unwrap_or(20).min(100);
    let tracks = sqlx::query_as::<_, Track>(
        "SELECT * FROM tracks WHERE play_count > 0 ORDER BY play_count DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();
    HttpResponse::Ok().json(tracks)
}

pub async fn get_genres(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let genres = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT genre FROM tracks WHERE genre IS NOT NULL AND genre != '' ORDER BY genre",
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(genres)
}

pub async fn get_folders(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let folders =
        sqlx::query_scalar::<_, String>("SELECT DISTINCT folder FROM tracks ORDER BY folder")
            .fetch_all(&data.db)
            .await
            .unwrap_or_default();

    HttpResponse::Ok().json(folders)
}

pub async fn get_stats(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let total_tracks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    let total_albums: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM albums")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    let total_artists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM artists")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    let total_duration: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(duration_ms), 0) FROM tracks")
            .fetch_one(&data.db)
            .await
            .unwrap_or(0);
    let total_size: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(file_size), 0) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);

    let top_artists = sqlx::query_as::<_, (String, i64)>(
        "SELECT artist, COUNT(*) as track_count FROM tracks GROUP BY artist ORDER BY track_count DESC LIMIT 10"
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(name, track_count)| serde_json::json!({"name": name, "track_count": track_count}))
    .collect::<Vec<_>>();

    let recently_played = sqlx::query_as::<_, Track>(
        "SELECT t.* FROM tracks t JOIN listening_history lh ON t.id = lh.track_id ORDER BY lh.played_at DESC LIMIT 10"
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let most_played = sqlx::query_as::<_, Track>(
        "SELECT * FROM tracks WHERE play_count > 0 ORDER BY play_count DESC LIMIT 10",
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(serde_json::json!({
        "total_tracks": total_tracks,
        "total_albums": total_albums,
        "total_artists": total_artists,
        "total_duration_ms": total_duration,
        "total_size_bytes": total_size,
        "top_artists": top_artists,
        "recently_played": recently_played,
        "most_played": most_played,
    }))
}

pub async fn create_playlist(
    data: web::Data<AppState>,
    body: web::Json<CreatePlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = uuid::Uuid::new_v4().to_string();

    let result = sqlx::query(
        "INSERT INTO playlists (id, name, description, is_smart, smart_filter, parent_id, library_id) VALUES (?, ?, ?, ?, ?, ?, '')"
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.is_smart.unwrap_or(false))
    .bind(&body.smart_filter)
    .bind(&body.parent_id)
    .execute(&data.db)
    .await;

    match result {
        Ok(_) => {
            let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match playlist {
                Ok(p) => HttpResponse::Created().json(p),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn get_playlists(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlists =
        sqlx::query_as::<_, Playlist>("SELECT * FROM playlists ORDER BY sort_order, name")
            .fetch_all(&data.db)
            .await;

    match playlists {
        Ok(p) => HttpResponse::Ok().json(p),
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn add_track_to_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<AddTrackToPlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();
    let position = body.position.unwrap_or(0);

    let result = sqlx::query(
        "INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, datetime('now'))"
    )
    .bind(&playlist_id)
    .bind(&body.track_id)
    .bind(position)
    .execute(&data.db)
    .await;

    match result {
        Ok(_) => {
            sqlx::query("UPDATE playlists SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?), updated_at = datetime('now') WHERE id = ?")
                .bind(&playlist_id)
                .bind(&playlist_id)
                .execute(&data.db)
                .await
                .ok();
            HttpResponse::Ok().json(serde_json::json!({"success": true}))
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn get_playlist_tracks(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();

    let tracks = sqlx::query_as::<_, Track>(
        "SELECT t.* FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position"
    )
    .bind(&playlist_id)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(tracks)
}

pub async fn delete_playlist(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();
    let _ = sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?")
        .bind(&id)
        .execute(&data.db)
        .await;
    let result = sqlx::query("DELETE FROM playlists WHERE id = ?")
        .bind(&id)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

fn get_mime_type(format: &str) -> &str {
    match format.to_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "aiff" | "aif" => "audio/aiff",
        "ogg" => "audio/ogg",
        "opus" => "audio/opus",
        "aac" => "audio/aac",
        "m4a" | "m4b" | "mp4" => "audio/mp4",
        "dsf" | "dff" => "audio/dsd",
        _ => "application/octet-stream",
    }
}

// ── Listening History ──────────────────────────────────────────────

pub async fn get_listening_history(
    data: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let limit: i64 = query.get("limit").and_then(|l| l.parse().ok()).unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, (String, String, String, Option<i64>)>(
        "SELECT lh.track_id, t.title, t.artist, lh.played_at FROM listening_history lh JOIN tracks t ON lh.track_id = t.id ORDER BY lh.played_at DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();
    let history: Vec<serde_json::Value> = rows.iter().map(|(id, title, artist, played)| {
        serde_json::json!({"track_id": id, "title": title, "artist": artist, "played_at": played})
    }).collect();
    HttpResponse::Ok().json(history)
}

pub async fn record_play(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let track_id = path.into_inner();
    let _ = sqlx::query("INSERT INTO listening_history (track_id) VALUES (?)")
        .bind(&track_id)
        .execute(&data.db)
        .await;
    let _ = sqlx::query("UPDATE tracks SET play_count = play_count + 1, last_played = datetime('now') WHERE id = ?")
        .bind(&track_id)
        .execute(&data.db)
        .await;
    HttpResponse::Ok().json(serde_json::json!({"ok": true}))
}

// ── Playlist Tools ────────────────────────────────────────────────

pub async fn shuffle_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<ShufflePlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();
    let mode = body.mode.as_deref().unwrap_or("smart");

    let tracks = get_playlist_track_ids(&data.db, &playlist_id).await;
    if tracks.is_empty() {
        return HttpResponse::Ok().json(PlaylistToolResult {
            success: false,
            message: "Playlist is empty or not found".to_string(),
            playlist_id: None,
            affected_tracks: None,
            details: None,
        });
    }

    let shuffled = match mode {
        "random" => {
            let mut rng = rand::thread_rng();
            let mut ids: Vec<String> = tracks.into_iter().map(|t| t.0).collect();
            ids.shuffle(&mut rng);
            ids
        }
        "no-consecutive-artist" => {
            let mut rng = rand::thread_rng();
            let mut track_ids: Vec<String> = tracks.into_iter().map(|t| t.0).collect();
            let mut result = Vec::new();

            while !track_ids.is_empty() {
                if result.is_empty() {
                    let idx = rng.gen_range(0..track_ids.len());
                    result.push(track_ids.remove(idx));
                } else {
                    let last_artist = get_artist_for_track(&data.db, result.last().unwrap()).await;
                    let mut valid: Vec<usize> = Vec::new();
                    for (i, id) in track_ids.iter().enumerate() {
                        let artist = get_artist_for_track(&data.db, id).await;
                        if artist != last_artist {
                            valid.push(i);
                        }
                    }
                    if valid.is_empty() {
                        let idx = rng.gen_range(0..track_ids.len());
                        result.push(track_ids.remove(idx));
                    } else {
                        let pick = valid[rng.gen_range(0..valid.len())];
                        result.push(track_ids.remove(pick));
                    }
                }
            }
            result
        }
        _ => {
            // "smart" shuffle: interleave high and low play-count tracks
            let mut by_play: Vec<(String, i32)> = tracks;
            by_play.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
            let mut result = Vec::new();
            let mut low = by_play.len() / 2;
            let mut high = 0;
            let mut toggle = true;
            while high < by_play.len() / 2 || low < by_play.len() {
                if toggle && high < by_play.len() / 2 {
                    result.push(by_play[high].0.clone());
                    high += 1;
                } else if low < by_play.len() {
                    result.push(by_play[low].0.clone());
                    low += 1;
                } else if high < by_play.len() / 2 {
                    result.push(by_play[high].0.clone());
                    high += 1;
                }
                toggle = !toggle;
            }
            result
        }
    };

    let count = shuffled.len() as i32;
    save_playlist_order(&data.db, &playlist_id, &shuffled).await;

    HttpResponse::Ok().json(PlaylistToolResult {
        success: true,
        message: format!("Shuffled {} tracks using '{}' mode", count, mode),
        playlist_id: Some(playlist_id),
        affected_tracks: Some(count),
        details: Some(serde_json::json!({"mode": mode, "tracks_shuffled": count})),
    })
}

pub async fn sort_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<SortPlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();

    let tracks = get_playlist_tracks_full(&data.db, &playlist_id).await;
    if tracks.is_empty() {
        return HttpResponse::Ok().json(PlaylistToolResult {
            success: false,
            message: "Playlist is empty or not found".to_string(),
            playlist_id: None,
            affected_tracks: None,
            details: None,
        });
    }

    let order = body.order.as_deref().unwrap_or("asc");
    let mut sorted = tracks;
    match body.sort_by.as_str() {
        "title" => sorted.sort_by(|a, b| cmp_with_order(&a.title, &b.title, order)),
        "artist" => sorted.sort_by(|a, b| cmp_with_order(&a.artist, &b.artist, order)),
        "album" => sorted.sort_by(|a, b| cmp_with_order(&a.album, &b.album, order)),
        "duration" => {
            sorted.sort_by(|a, b| cmp_with_order_num(a.duration_ms, b.duration_ms, order))
        }
        "year" => sorted.sort_by(|a, b| cmp_with_order_opt(a.year, b.year, order)),
        "date_added" => sorted.sort_by(|a, b| cmp_with_order(&a.date_added, &b.date_added, order)),
        "play_count" => sorted
            .sort_by(|a, b| cmp_with_order_num(a.play_count as i64, b.play_count as i64, order)),
        "rating" => sorted.sort_by(|a, b| cmp_with_order_opt(a.rating, b.rating, order)),
        "genre" => sorted.sort_by(|a, b| {
            let ga = a.genre.as_deref().unwrap_or("");
            let gb = b.genre.as_deref().unwrap_or("");
            cmp_with_order(ga, gb, order)
        }),
        "random" => {
            let mut rng = rand::thread_rng();
            sorted.shuffle(&mut rng);
        }
        _ => {}
    }

    let ids: Vec<String> = sorted.into_iter().map(|t| t.id).collect();
    let count = ids.len() as i32;
    save_playlist_order(&data.db, &playlist_id, &ids).await;

    HttpResponse::Ok().json(PlaylistToolResult {
        success: true,
        message: format!("Sorted {} tracks by {}", count, body.sort_by),
        playlist_id: Some(playlist_id),
        affected_tracks: Some(count),
        details: Some(
            serde_json::json!({"sort_by": body.sort_by, "order": order, "tracks_sorted": count}),
        ),
    })
}

pub async fn dedupe_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<DedupePlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();
    let strategy = body.strategy.as_deref().unwrap_or("title_artist");

    let tracks = get_playlist_tracks_full(&data.db, &playlist_id).await;
    if tracks.is_empty() {
        return HttpResponse::Ok().json(PlaylistToolResult {
            success: false,
            message: "Playlist is empty or not found".to_string(),
            playlist_id: None,
            affected_tracks: None,
            details: None,
        });
    }

    let before_count = tracks.len();
    let mut seen = std::collections::HashSet::new();
    let mut unique_ids = Vec::new();
    let mut duplicates = Vec::new();

    for track in &tracks {
        let key = match strategy {
            "exact" => format!("{}:{}", track.file_path, track.title),
            "fingerprint" => track
                .fingerprint
                .clone()
                .unwrap_or_else(|| format!("{}:{}", track.title, track.artist)),
            _ => format!(
                "{}:{}",
                track.title.to_lowercase(),
                track.artist.to_lowercase()
            ),
        };
        if seen.insert(key) {
            unique_ids.push(track.id.clone());
        } else {
            duplicates.push(track.title.clone());
        }
    }

    let removed = before_count - unique_ids.len();
    save_playlist_order(&data.db, &playlist_id, &unique_ids).await;

    HttpResponse::Ok().json(PlaylistToolResult {
        success: true,
        message: format!("Removed {} duplicate tracks", removed),
        playlist_id: Some(playlist_id),
        affected_tracks: Some(removed as i32),
        details: Some(serde_json::json!({
            "strategy": strategy,
            "before": before_count,
            "after": unique_ids.len(),
            "removed": removed,
            "duplicate_titles": duplicates,
        })),
    })
}

pub async fn generate_playlist(
    data: web::Data<AppState>,
    body: web::Json<GeneratePlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let count = body.count.unwrap_or(20).min(100);

    let mut where_clauses = vec!["1=1".to_string()];
    let mut binds: Vec<String> = Vec::new();

    match body.source.as_str() {
        "genre" => {
            if let Some(ref genre) = body.source_value {
                where_clauses.push("genre = ?".to_string());
                binds.push(genre.clone());
            }
        }
        "artist" => {
            if let Some(ref artist) = body.source_value {
                where_clauses.push("artist LIKE ?".to_string());
                binds.push(format!("%{}%", artist));
            }
        }
        "mood" => {
            if let Some(ref mood) = body.source_value {
                where_clauses.push("mood = ?".to_string());
                binds.push(mood.clone());
            }
        }
        "recently_played" => {
            where_clauses.push("last_played IS NOT NULL".to_string());
            where_clauses.push("last_played != ''".to_string());
        }
        "unplayed" => {
            where_clauses.push("play_count = 0".to_string());
        }
        "top_rated" => {
            where_clauses.push("rating IS NOT NULL".to_string());
            where_clauses.push("rating >= 4".to_string());
        }
        _ => {} // "library" - no extra filter
    }

    if let Some(min_dur) = body.min_duration_ms {
        where_clauses.push("duration_ms >= ?".to_string());
        binds.push(min_dur.to_string());
    }
    if let Some(max_dur) = body.max_duration_ms {
        where_clauses.push("duration_ms <= ?".to_string());
        binds.push(max_dur.to_string());
    }
    if let Some(min_rating) = body.min_rating {
        where_clauses.push("rating >= ?".to_string());
        binds.push(min_rating.to_string());
    }

    let where_str = where_clauses.join(" AND ");
    let sql = format!(
        "SELECT * FROM tracks WHERE {} ORDER BY RANDOM() LIMIT {}",
        where_str, count
    );

    let mut q = sqlx::query_as::<_, Track>(&sql);
    for bind in &binds {
        q = q.bind(bind);
    }
    let tracks = q.fetch_all(&data.db).await.unwrap_or_default();

    if tracks.is_empty() {
        return HttpResponse::Ok().json(PlaylistToolResult {
            success: false,
            message: "No tracks match the specified criteria".to_string(),
            playlist_id: None,
            affected_tracks: None,
            details: None,
        });
    }

    // Create the playlist
    let id = uuid::Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO playlists (id, name, description, library_id) VALUES (?, ?, ?, '')",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(format!("Auto-generated from: {}", body.source))
    .execute(&data.db)
    .await;

    let track_ids: Vec<String> = tracks.iter().map(|t| t.id.clone()).collect();
    save_playlist_order(&data.db, &id, &track_ids).await;

    let total_duration: i64 = tracks.iter().map(|t| t.duration_ms).sum();

    HttpResponse::Ok().json(PlaylistToolResult {
        success: true,
        message: format!("Generated '{}' with {} tracks", body.name, tracks.len()),
        playlist_id: Some(id),
        affected_tracks: Some(tracks.len() as i32),
        details: Some(serde_json::json!({
            "name": body.name,
            "source": body.source,
            "track_count": tracks.len(),
            "total_duration_ms": total_duration,
        })),
    })
}

pub async fn share_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<SharePlaylistRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();

    let tracks = get_playlist_tracks_full(&data.db, &playlist_id).await;
    if tracks.is_empty() {
        return HttpResponse::Ok().json(PlaylistToolResult {
            success: false,
            message: "Playlist is empty or not found".to_string(),
            playlist_id: None,
            affected_tracks: None,
            details: None,
        });
    }

    let include_meta = body.include_metadata.unwrap_or(true);

    let playlist_data = serde_json::json!({
        "name": body.name,
        "description": body.description,
        "track_count": tracks.len(),
        "tracks": tracks.iter().map(|t| {
            let mut obj = serde_json::json!({
                "title": t.title,
                "artist": t.artist,
                "album": t.album,
                "duration_ms": t.duration_ms,
            });
            if include_meta {
                obj["genre"] = serde_json::json!(t.genre);
                obj["year"] = serde_json::json!(t.year);
                obj["format"] = serde_json::json!(t.format);
            }
            obj
        }).collect::<Vec<_>>(),
    });

    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        playlist_data.to_string().as_bytes(),
    );

    let share_url = format!("resonance://playlist/{}", encoded);

    HttpResponse::Ok().json(PlaylistToolResult {
        success: true,
        message: format!("Created shareable playlist with {} tracks", tracks.len()),
        playlist_id: Some(playlist_id),
        affected_tracks: Some(tracks.len() as i32),
        details: Some(serde_json::json!({
            "share_url": share_url,
            "track_count": tracks.len(),
            "total_duration_ms": tracks.iter().map(|t| t.duration_ms).sum::<i64>(),
        })),
    })
}

pub async fn playlist_stats(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let playlist_id = path.into_inner();
    let tracks = get_playlist_tracks_full(&data.db, &playlist_id).await;

    if tracks.is_empty() {
        return HttpResponse::NotFound().json(serde_json::json!({"error": "Playlist not found"}));
    }

    let total_duration: i64 = tracks.iter().map(|t| t.duration_ms).sum();
    let total_size: i64 = tracks.iter().map(|t| t.file_size).sum();

    let mut artists: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    let mut albums: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    let mut genres: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    let mut formats: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    let mut avg_rating = 0.0;
    let mut rated_count = 0;

    for track in &tracks {
        *artists.entry(track.artist.clone()).or_insert(0) += 1;
        *albums.entry(track.album.clone()).or_insert(0) += 1;
        if let Some(ref g) = track.genre {
            if !g.is_empty() {
                *genres.entry(g.clone()).or_insert(0) += 1;
            }
        }
        *formats.entry(track.format.clone()).or_insert(0) += 1;
        if let Some(r) = track.rating {
            avg_rating += r as f64;
            rated_count += 1;
        }
    }

    if rated_count > 0 {
        avg_rating /= rated_count as f64;
    }

    let mut top_artists: Vec<_> = artists.into_iter().collect();
    top_artists.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
    top_artists.truncate(5);

    HttpResponse::Ok().json(serde_json::json!({
        "track_count": tracks.len(),
        "total_duration_ms": total_duration,
        "total_size_bytes": total_size,
        "avg_rating": (avg_rating * 10.0).round() / 10.0,
        "unique_artists": top_artists.len(),
        "unique_albums": albums.len(),
        "top_artists": top_artists,
        "genres": genres,
        "formats": formats,
    }))
}

// ── Batch Operations ─────────────────────────────────────────────

pub async fn batch_delete_tracks(
    data: web::Data<AppState>,
    body: web::Json<serde_json::Value>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let ids = body.get("ids").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let ids: Vec<String> = ids.iter().filter_map(|v| v.as_str().map(String::from)).collect();
    if ids.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "No track IDs provided"}));
    }
    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let query = format!("DELETE FROM tracks WHERE id IN ({})", placeholders.join(","));
    let mut q = sqlx::query(&query);
    for id in &ids { q = q.bind(id); }
    match q.execute(&data.db).await {
        Ok(r) => HttpResponse::Ok().json(serde_json::json!({"deleted": r.rows_affected()})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn batch_update_rating(
    data: web::Data<AppState>,
    body: web::Json<serde_json::Value>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let ids = body.get("ids").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let rating = body.get("rating").and_then(|v| v.as_i64());
    let ids: Vec<String> = ids.iter().filter_map(|v| v.as_str().map(String::from)).collect();
    let rating = match rating {
        Some(r) if (0..=5).contains(&r) => r as i32,
        _ => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid rating (0-5)"})),
    };
    if ids.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "No track IDs provided"}));
    }
    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let query = format!("UPDATE tracks SET rating = ? WHERE id IN ({})", placeholders.join(","));
    let mut q = sqlx::query(&query).bind(rating);
    for id in &ids { q = q.bind(id); }
    match q.execute(&data.db).await {
        Ok(r) => HttpResponse::Ok().json(serde_json::json!({"updated": r.rows_affected()})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

// ── Helper functions ──────────────────────────────────────────────

async fn get_playlist_track_ids(db: &SqlitePool, playlist_id: &str) -> Vec<(String, i32)> {
    sqlx::query_as::<_, (String, i32)>(
        "SELECT pt.track_id, t.play_count FROM playlist_tracks pt JOIN tracks t ON pt.track_id = t.id WHERE pt.playlist_id = ? ORDER BY pt.position",
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await
    .unwrap_or_default()
}

async fn get_playlist_tracks_full(db: &SqlitePool, playlist_id: &str) -> Vec<Track> {
    sqlx::query_as::<_, Track>(
        "SELECT t.* FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position"
    )
    .bind(playlist_id)
    .fetch_all(db)
    .await
    .unwrap_or_default()
}

async fn get_artist_for_track(db: &SqlitePool, track_id: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT artist FROM tracks WHERE id = ?")
        .bind(track_id)
        .fetch_one(db)
        .await
        .unwrap_or_default()
}

async fn save_playlist_order(db: &SqlitePool, playlist_id: &str, track_ids: &[String]) {
    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            log::error!("save_playlist_order transaction begin failed: {}", e);
            return;
        }
    };

    let _ = sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?")
        .bind(playlist_id)
        .execute(&mut *tx)
        .await;

    for (i, track_id) in track_ids.iter().enumerate() {
        let _ = sqlx::query(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, datetime('now'))"
        )
        .bind(playlist_id)
        .bind(track_id)
        .bind(i as i32)
        .execute(&mut *tx)
        .await;
    }

    let _ = sqlx::query(
        "UPDATE playlists SET track_count = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(track_ids.len() as i32)
    .bind(playlist_id)
    .execute(&mut *tx)
    .await;

    let _ = tx.commit().await;
}

fn cmp_with_order(a: &str, b: &str, order: &str) -> std::cmp::Ordering {
    if order == "desc" {
        b.to_lowercase().cmp(&a.to_lowercase())
    } else {
        a.to_lowercase().cmp(&b.to_lowercase())
    }
}

fn cmp_with_order_num(a: i64, b: i64, order: &str) -> std::cmp::Ordering {
    if order == "desc" {
        b.cmp(&a)
    } else {
        a.cmp(&b)
    }
}

fn cmp_with_order_opt(a: Option<i32>, b: Option<i32>, order: &str) -> std::cmp::Ordering {
    match (a, b) {
        (Some(x), Some(y)) => {
            if order == "desc" {
                y.cmp(&x)
            } else {
                x.cmp(&y)
            }
        }
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

#[derive(serde::Deserialize)]
pub struct BrowseQuery {
    pub path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub async fn browse_directory(
    data: web::Data<AppState>,
    query: web::Query<BrowseQuery>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }

    let path_str = query.path.as_deref().unwrap_or("/");
    let path = PathBuf::from(path_str);

    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "Path does not exist or is not accessible"}));
        }
    };

    if !canonical.is_dir() {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "Path is not a directory"}));
    }

    // Restrict browsing to configured library paths
    let libraries = sqlx::query_as::<_, Library>("SELECT * FROM libraries")
        .fetch_all(&data.db)
        .await
        .unwrap_or_default();
    let allowed = libraries.iter().any(|lib| {
        PathBuf::from(&lib.path)
            .canonicalize()
            .map(|p| canonical.starts_with(&p))
            .unwrap_or(false)
    });
    if !allowed && canonical != Path::new("/") && canonical != Path::new("C:\\") {
        // Allow root listing only as fallback, but block anything outside library paths
        return HttpResponse::Forbidden()
            .json(serde_json::json!({"error": "Path is outside configured libraries"}));
    }

    let mut entries: Vec<BrowseEntry> = Vec::new();

    if let Some(parent) = canonical.parent() {
        entries.push(BrowseEntry {
            name: "..".to_string(),
            path: parent.to_string_lossy().to_string(),
            is_dir: true,
        });
    }

    if let Ok(read_dir) = std::fs::read_dir(&canonical) {
        for entry in read_dir.flatten() {
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if metadata.is_dir() {
                let entry_path = entry.path().to_string_lossy().to_string();
                entries.push(BrowseEntry {
                    name,
                    path: entry_path,
                    is_dir: true,
                });
            }
        }
    }

    if entries.len() > 1 {
        entries[1..].sort_by_key(|a| a.name.to_lowercase());
    }

    HttpResponse::Ok().json(serde_json::json!({
        "current": canonical.to_string_lossy(),
        "entries": entries,
    }))
}

pub async fn get_scrobbling_settings(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let config = scrobble::get_scrobbling_config(&data.db).await;
    HttpResponse::Ok().json(config)
}

pub async fn update_scrobbling_settings(
    data: web::Data<AppState>,
    body: web::Json<UpdateScrobblingRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let mut config = scrobble::get_scrobbling_config(&data.db).await;

    if let Some(ref lastfm) = body.lastfm {
        config.lastfm = lastfm.clone();
    }
    if let Some(ref listenbrainz) = body.listenbrainz {
        config.listenbrainz = listenbrainz.clone();
    }

    scrobble::save_scrobbling_config(&data.db, &config).await;

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "config": config,
    }))
}

pub async fn test_scrobbling(
    data: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let service = query.get("service").map(|s| s.as_str()).unwrap_or("all");
    let config = scrobble::get_scrobbling_config(&data.db).await;
    let mut results = serde_json::Map::new();

    if service == "all" || service == "lastfm" {
        let connected = config.lastfm.enabled
            && config.lastfm.api_key.is_some()
            && config.lastfm.session_key.is_some();
        results.insert(
            "lastfm".to_string(),
            serde_json::json!({
                "connected": connected,
                "username": config.lastfm.username,
            }),
        );
    }

    if service == "all" || service == "listenbrainz" {
        let connected = config.listenbrainz.enabled && config.listenbrainz.token.is_some();
        results.insert(
            "listenbrainz".to_string(),
            serde_json::json!({
                "connected": connected,
            }),
        );
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "services": results,
    }))
}

pub async fn get_lyrics(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_optional(&data.db)
        .await;

    match track {
        Ok(Some(track)) => {
            let lyrics_content = track.lyrics.unwrap_or_default();
            let synced = if lyrics::is_lrc(&lyrics_content) {
                Some(lyrics_content.clone())
            } else {
                None
            };
            let plain = if lyrics::is_lrc(&lyrics_content) {
                lyrics::extract_plain_from_lrc(&lyrics_content)
            } else {
                lyrics_content
            };
            HttpResponse::Ok().json(serde_json::json!({
                "plain": plain,
                "synced": synced,
            }))
        }
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({"error": "Track not found"})),
        Err(_) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "Database error"}))
        }
    }
}

#[derive(serde::Deserialize)]
pub struct UpdateLyricsRequest {
    pub lyrics: String,
}

pub async fn update_lyrics(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<UpdateLyricsRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let result = sqlx::query("UPDATE tracks SET lyrics = ? WHERE id = ?")
        .bind(&body.lyrics)
        .bind(&id)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(_) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "Failed to update lyrics"})),
    }
}

pub async fn fetch_lyrics(data: web::Data<AppState>, path: web::Path<String>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_optional(&data.db)
        .await;

    let track = match track {
        Ok(Some(t)) => t,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "Track not found"}))
        }
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "Database error"}))
        }
    };

    let client = reqwest::Client::new();
    let result = lyrics::fetch_from_lrclib(
        &client,
        &track.artist,
        &track.title,
        &track.album,
        track.duration_ms,
    )
    .await;

    match result {
        Some(lyrics_result) => {
            let content = lyrics_result.synced.unwrap_or(lyrics_result.plain);
            let _ = sqlx::query("UPDATE tracks SET lyrics = ? WHERE id = ?")
                .bind(&content)
                .bind(&id)
                .execute(&data.db)
                .await;

            let has_synced = lyrics::is_lrc(&content);
            let plain = if has_synced {
                lyrics::extract_plain_from_lrc(&content)
            } else {
                content.clone()
            };
            let synced = if has_synced { Some(content) } else { None };

            HttpResponse::Ok().json(serde_json::json!({
                "plain": plain,
                "synced": synced,
            }))
        }
        None => HttpResponse::Ok().json(serde_json::json!({
            "plain": "",
            "synced": null,
        })),
    }
}

pub async fn get_updater_status(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let status = updater::get_updater_status(&data.db).await;
    HttpResponse::Ok().json(status)
}

pub async fn check_for_updates(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    match updater::check_for_updates(&data.db).await {
        Ok(status) => HttpResponse::Ok().json(status),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

pub async fn apply_update(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    match updater::apply_update(&data.db).await {
        Ok(message) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": message,
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

pub async fn get_updater_config(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let config = updater::get_updater_config(&data.db).await;
    HttpResponse::Ok().json(config)
}

pub async fn update_updater_config(
    data: web::Data<AppState>,
    body: web::Json<updater::UpdaterConfig>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    updater::save_updater_config(&data.db, &body).await;
    let config = updater::get_updater_config(&data.db).await;
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "config": config,
    }))
}

pub async fn preview_import(
    data: web::Data<AppState>,
    body: web::Json<ImportPreviewRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let mut preview = match body.platform.as_str() {
        "spotify" => match crate::importer::parse_spotify(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        "youtube_music" => match crate::importer::parse_youtube_music(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        "apple_music" => match crate::importer::parse_apple_music(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        "soundcloud" => match crate::importer::parse_soundcloud(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        "m3u" => match crate::importer::parse_m3u(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        "xspf" => match crate::importer::parse_xspf(&body.content) {
            Ok(p) => p,
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
        },
        _ => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "Unsupported platform"}))
        }
    };

    crate::importer::match_tracks(&data.db, &mut preview).await;
    HttpResponse::Ok().json(preview)
}

pub async fn confirm_import(
    data: web::Data<AppState>,
    body: web::Json<ImportConfirmRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let playlist_id = uuid::Uuid::new_v4().to_string();

    let result = sqlx::query(
        "INSERT INTO playlists (id, name, description, is_smart, smart_filter, parent_id, library_id, source_platform) VALUES (?, ?, NULL, FALSE, NULL, NULL, '', ?)"
    )
    .bind(&playlist_id)
    .bind(&body.playlist_name)
    .bind(&body.platform)
    .execute(&data.db)
    .await;

    if let Err(e) = result {
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": e.to_string()}));
    }

    let mut added = 0;
    for (pos, track) in body.tracks.iter().enumerate() {
        let track_id = if let Some(id) = &track.track_id {
            id.clone()
        } else {
            continue;
        };

        let _ = sqlx::query(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
        )
        .bind(&playlist_id)
        .bind(&track_id)
        .bind(pos as i32)
        .execute(&data.db)
        .await;

        added += 1;
    }

    let _ = sqlx::query("UPDATE playlists SET track_count = ? WHERE id = ?")
        .bind(added)
        .bind(&playlist_id)
        .execute(&data.db)
        .await;

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "playlist_id": playlist_id,
        "tracks_added": added,
    }))
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct DeviceTrack {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: Option<i64>,
    pub year: Option<i32>,
    pub track_number: Option<i32>,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub file_size: Option<i64>,
    pub date_added: Option<i64>,
}

#[derive(serde::Deserialize)]
pub struct DeviceScanRequest {
    pub library_id: Option<String>,
    pub tracks: Vec<DeviceTrack>,
}

pub async fn import_device_music(
    data: web::Data<AppState>,
    body: web::Json<DeviceScanRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let library_id = if let Some(id) = &body.library_id {
        id.clone()
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        let _ =
            sqlx::query("INSERT INTO libraries (id, name, path) VALUES (?, 'Device Music', '')")
                .bind(&id)
                .execute(&data.db)
                .await;
        id
    };

    let mut added = 0;
    let mut skipped = 0;

    for track in &body.tracks {
        if track.path.is_empty() {
            skipped += 1;
            continue;
        }

        let existing = sqlx::query_scalar::<_, String>("SELECT id FROM tracks WHERE file_path = ?")
            .bind(&track.path)
            .fetch_optional(&data.db)
            .await;

        match existing {
            Ok(Some(_)) => {
                skipped += 1;
                continue;
            }
            Err(_) => {
                skipped += 1;
                continue;
            }
            _ => {}
        }

        let id = uuid::Uuid::new_v4().to_string();
        let folder = std::path::Path::new(&track.path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let format = track
            .mime_type
            .as_deref()
            .unwrap_or("audio/mpeg")
            .replace("audio/", "");

        let result = sqlx::query(
            r#"INSERT OR IGNORE INTO tracks (
                id, title, artist, album, album_artist, genre, year, track_number,
                disc_number, duration_ms, file_path, file_name, file_size, file_modified,
                format, sample_rate, bit_depth, bitrate, channels, codec, composer,
                lyricist, mood, bpm, rating, play_count, skip_count, last_played,
                date_added, has_artwork, artwork_hash, lyrics, comment, grouping,
                copyright, custom_tags, folder, library_id, fingerprint, waveform_peaks
            ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, NULL, datetime('now'), FALSE, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, '', NULL)"#
        )
        .bind(&id)
        .bind(&track.title)
        .bind(&track.artist)
        .bind(&track.album)
        .bind(track.year)
        .bind(track.track_number)
        .bind(track.duration_ms.unwrap_or(0))
        .bind(&track.path)
        .bind(&track.file_name)
        .bind(track.file_size.unwrap_or(0))
        .bind(format)
        .bind(&folder)
        .bind(&library_id)
        .execute(&data.db)
        .await;

        match result {
            Ok(_) => added += 1,
            Err(e) => {
                log::warn!("Failed to insert track {}: {}", track.path, e);
                skipped += 1;
            }
        }
    }

    let _ = sqlx::query(
        "UPDATE libraries SET track_count = (SELECT COUNT(*) FROM tracks WHERE library_id = ?), last_scan = datetime('now') WHERE id = ?"
    )
    .bind(&library_id)
    .bind(&library_id)
    .execute(&data.db)
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "library_id": library_id,
        "tracks_added": added,
        "tracks_skipped": skipped,
        "total_scanned": body.tracks.len(),
    }))
}

pub async fn get_import_formats(req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    HttpResponse::Ok().json(serde_json::json!({
        "formats": [
            {
                "id": "spotify",
                "name": "Spotify",
                "description": "Export from Spotify account data (JSON)",
                "extensions": ["json"],
                "example": "Go to Spotify Privacy > Account Data > Download. Look for 'YourPlaylists' or playlist JSON files."
            },
            {
                "id": "youtube_music",
                "name": "YouTube Music",
                "description": "Export from Google Takeout (JSON)",
                "extensions": ["json"],
                "example": "Go to Google Takeout > YouTube and YouTube Music > Export. Select 'playlists' and download the ZIP."
            },
            {
                "id": "apple_music",
                "name": "Apple Music",
                "description": "Apple Music playlist export (JSON)",
                "extensions": ["json"],
                "example": "Use a third-party tool or export from Music app XML library."
            },
            {
                "id": "soundcloud",
                "name": "SoundCloud",
                "description": "SoundCloud likes/playlists export (JSON)",
                "extensions": ["json"],
                "example": "Export from SoundCloud or use a third-party tool to export your likes."
            },
            {
                "id": "m3u",
                "name": "M3U/M3U8",
                "description": "Standard M3U playlist format",
                "extensions": ["m3u", "m3u8"],
                "example": "Most music players can export to M3U format."
            },
            {
                "id": "xspf",
                "name": "XSPF",
                "description": "XML Shareable Playlist Format",
                "extensions": ["xspf"],
                "example": "VLC, Clementine, and other players support XSPF export."
            }
        ]
    }))
}

#[derive(serde::Deserialize)]
pub struct ExportRequest {
    pub playlist_id: String,
    pub target_platform: String,
}

pub async fn export_playlist(
    data: web::Data<AppState>,
    body: web::Json<ExportRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let playlist =
        sqlx::query_as::<_, (String, String)>("SELECT id, name FROM playlists WHERE id = ?")
            .bind(&body.playlist_id)
            .fetch_optional(&data.db)
            .await;

    let playlist = match playlist {
        Ok(Some(p)) => p,
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "Playlist not found"}))
        }
        Err(e) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": e.to_string()}))
        }
    };

    let tracks = match crate::importer::get_playlist_export_tracks(&data.db, &body.playlist_id)
        .await
    {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e})),
    };

    if tracks.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Playlist is empty"}));
    }

    let (content, filename, content_type) = match body.target_platform.as_str() {
        "spotify" => (
            crate::importer::export_to_spotify_csv(&tracks, &playlist.1),
            format!("{}.csv", playlist.1),
            "text/csv".to_string(),
        ),
        "youtube_music" => (
            crate::importer::export_to_youtube_music_text(&tracks),
            format!("{}.txt", playlist.1),
            "text/plain".to_string(),
        ),
        "apple_music" => (
            crate::importer::export_to_apple_music_m3u(&tracks, &playlist.1),
            format!("{}.m3u", playlist.1),
            "audio/x-mpegurl".to_string(),
        ),
        "soundcloud" => (
            crate::importer::export_to_soundcloud_text(&tracks),
            format!("{}.txt", playlist.1),
            "text/plain".to_string(),
        ),
        "m3u" => (
            crate::importer::export_to_m3u(&tracks, &playlist.1),
            format!("{}.m3u", playlist.1),
            "audio/x-mpegurl".to_string(),
        ),
        "xspf" => (
            crate::importer::export_to_xspf(&tracks, &playlist.1),
            format!("{}.xspf", playlist.1),
            "application/xspf+xml".to_string(),
        ),
        _ => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "Unsupported target platform"}))
        }
    };

    let safe_name = filename.replace(['"', '\n', '\r'], "");
    HttpResponse::Ok()
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", safe_name),
        ))
        .insert_header(("Content-Type", content_type))
        .body(content)
}

pub async fn get_transfer_platforms(req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    HttpResponse::Ok().json(serde_json::json!({
        "platforms": [
            {
                "id": "spotify",
                "name": "Spotify",
                "export_formats": ["csv"],
                "import_formats": ["csv"],
                "description": "Transfer to/from Spotify",
                "color": "#1DB954"
            },
            {
                "id": "youtube_music",
                "name": "YouTube Music",
                "export_formats": ["txt"],
                "import_formats": ["txt"],
                "description": "Transfer to/from YouTube Music",
                "color": "#FF0000"
            },
            {
                "id": "apple_music",
                "name": "Apple Music",
                "export_formats": ["m3u"],
                "import_formats": ["m3u"],
                "description": "Transfer to/from Apple Music",
                "color": "#FC3C44"
            },
            {
                "id": "soundcloud",
                "name": "SoundCloud",
                "export_formats": ["txt"],
                "import_formats": ["txt"],
                "description": "Transfer to/from SoundCloud",
                "color": "#FF5500"
            }
        ]
    }))
}

pub async fn update_track_rating(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<UpdateRatingRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let rating = if let Some(r) = body.rating {
        if !(0..=5).contains(&r) {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "Rating must be between 0 and 5"}));
        }
        Some(r)
    } else {
        None
    };

    let result = sqlx::query("UPDATE tracks SET rating = ? WHERE id = ?")
        .bind(rating)
        .bind(&id)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => {
            let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match track {
                Ok(t) => HttpResponse::Ok().json(t),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn evaluate_smart_playlist(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    let playlist = match playlist {
        Ok(p) => p,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "Playlist not found"}))
        }
    };

    let filter_json = match &playlist.smart_filter {
        Some(f) if !f.is_empty() => f.clone(),
        _ => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "Playlist has no smart filter defined"}))
        }
    };

    let config: SmartPlaylistConfig = match serde_json::from_str(&filter_json) {
        Ok(c) => c,
        Err(e) => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": format!("Invalid filter JSON: {}", e)}))
        }
    };

    if config.rules.is_empty() {
        return HttpResponse::Ok().json(Vec::<Track>::new());
    }

    let mut where_clauses = Vec::new();
    let mut bind_values = Vec::new();

    for rule in &config.rules {
        let (clause, val) = match rule.field.as_str() {
            "play_count" => {
                let num_val: i64 = match rule.value.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let op = match rule.op.as_str() {
                    "eq" => "=",
                    "neq" => "<>",
                    "gt" => ">",
                    "lt" => "<",
                    "gte" => ">=",
                    "lte" => "<=",
                    _ => continue,
                };
                (format!("play_count {} ?", op), Some(num_val.to_string()))
            }
            "rating" => {
                let num_val: i64 = match rule.value.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let op = match rule.op.as_str() {
                    "eq" => "=",
                    "neq" => "<>",
                    "gt" => ">",
                    "lt" => "<",
                    "gte" => ">=",
                    "lte" => "<=",
                    _ => continue,
                };
                (format!("rating {} ?", op), Some(num_val.to_string()))
            }
            "year" => {
                let num_val: i64 = match rule.value.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let op = match rule.op.as_str() {
                    "eq" => "=",
                    "neq" => "<>",
                    "gt" => ">",
                    "lt" => "<",
                    "gte" => ">=",
                    "lte" => "<=",
                    _ => continue,
                };
                (format!("year {} ?", op), Some(num_val.to_string()))
            }
            "duration_ms" => {
                let num_val: i64 = match rule.value.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let op = match rule.op.as_str() {
                    "eq" => "=",
                    "neq" => "<>",
                    "gt" => ">",
                    "lt" => "<",
                    "gte" => ">=",
                    "lte" => "<=",
                    _ => continue,
                };
                (format!("duration_ms {} ?", op), Some(num_val.to_string()))
            }
            "last_played" => {
                let op = match rule.op.as_str() {
                    "before" => "<",
                    "after" => ">",
                    "eq" => "=",
                    "neq" => "<>",
                    _ => continue,
                };
                (format!("last_played {} ?", op), Some(rule.value.clone()))
            }
            "date_added" => {
                let op = match rule.op.as_str() {
                    "before" => "<",
                    "after" => ">",
                    "eq" => "=",
                    "neq" => "<>",
                    _ => continue,
                };
                (format!("date_added {} ?", op), Some(rule.value.clone()))
            }
            "genre" => {
                match rule.op.as_str() {
                    "eq" => ("genre = ?".to_string(), Some(rule.value.clone())),
                    "neq" => ("genre <> ?".to_string(), Some(rule.value.clone())),
                    "contains" => (
                        "genre LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    "not_contains" => (
                        "genre NOT LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    _ => continue,
                }
            }
            "artist" => {
                match rule.op.as_str() {
                    "eq" => ("artist = ?".to_string(), Some(rule.value.clone())),
                    "neq" => ("artist <> ?".to_string(), Some(rule.value.clone())),
                    "contains" => (
                        "artist LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    "not_contains" => (
                        "artist NOT LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    _ => continue,
                }
            }
            "album" => {
                match rule.op.as_str() {
                    "eq" => ("album = ?".to_string(), Some(rule.value.clone())),
                    "neq" => ("album <> ?".to_string(), Some(rule.value.clone())),
                    "contains" => (
                        "album LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    "not_contains" => (
                        "album NOT LIKE ?".to_string(),
                        Some(format!("%{}%", rule.value)),
                    ),
                    _ => continue,
                }
            }
            _ => continue,
        };

        where_clauses.push(clause);
        if let Some(val) = val {
            bind_values.push(val);
        }
    }

    if where_clauses.is_empty() {
        return HttpResponse::Ok().json(Vec::<Track>::new());
    }

    let joiner = if config.match_all { " AND " } else { " OR " };
    let where_str = where_clauses.join(joiner);
    let sql = format!("SELECT * FROM tracks WHERE {} ORDER BY date_added DESC", where_str);

    let mut query = sqlx::query_as::<_, Track>(&sql);
    for val in &bind_values {
        query = query.bind(val);
    }

    let tracks = query.fetch_all(&data.db).await.unwrap_or_default();

    HttpResponse::Ok().json(tracks)
}

pub async fn update_smart_playlist_rules(
    data: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<SmartPlaylistConfig>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    if playlist.is_err() {
        return HttpResponse::NotFound()
            .json(serde_json::json!({"error": "Playlist not found"}));
    }

    let filter_json = match serde_json::to_string(&body.into_inner()) {
        Ok(j) => j,
        Err(e) => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": format!("Failed to serialize rules: {}", e)}))
        }
    };

    let result = sqlx::query(
        "UPDATE playlists SET is_smart = TRUE, smart_filter = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(&filter_json)
    .bind(&id)
    .execute(&data.db)
    .await;

    match result {
        Ok(_) => {
            let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match playlist {
                Ok(p) => HttpResponse::Ok().json(p),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
        }
    }
}

pub async fn get_transcode_settings(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let result = sqlx::query_as::<_, SettingRow>("SELECT key, value FROM settings WHERE key LIKE 'transcode_%'")
        .fetch_all(&data.db)
        .await;

    let settings = result.unwrap_or_default();
    let enabled = settings.iter().find(|s| s.key == "transcode_enabled")
        .map(|s| s.value == "true").unwrap_or(false);
    let format = settings.iter().find(|s| s.key == "transcode_format")
        .map(|s| s.value.clone()).unwrap_or_else(|| "aac".to_string());
    let bitrate = settings.iter().find(|s| s.key == "transcode_bitrate")
        .and_then(|s| s.value.parse().ok()).unwrap_or(192);

    HttpResponse::Ok().json(TranscodeConfig { enabled, format, bitrate })
}

pub async fn update_transcode_settings(
    data: web::Data<AppState>,
    body: web::Json<TranscodeConfig>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let settings = [
        ("transcode_enabled", body.enabled.to_string()),
        ("transcode_format", body.format.clone()),
        ("transcode_bitrate", body.bitrate.to_string()),
    ];

    for (key, value) in &settings {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
            .bind(key)
            .bind(value)
            .execute(&data.db)
            .await
            .ok();
    }

    HttpResponse::Ok().json(body.into_inner())
}

pub async fn stream_track_transcoded(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    let id = path.into_inner();

    let transcode_enabled = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'transcode_enabled'")
        .fetch_one(&data.db)
        .await
        .unwrap_or_else(|_| "false".to_string()) == "true";

    if !transcode_enabled {
        return stream_track_raw(&data.db, &id, &req).await;
    }

    let format = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'transcode_format'")
        .fetch_one(&data.db)
        .await
        .unwrap_or_else(|_| "aac".to_string());

    let bitrate = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'transcode_bitrate'")
        .fetch_one(&data.db)
        .await
        .unwrap_or_else(|_| "192".to_string())
        .parse::<i32>()
        .unwrap_or(192);

    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(&id)
        .fetch_one(&data.db)
        .await;

    match track {
        Ok(t) => {
            // Validate the file path is within a configured library directory
            let file_path = std::path::Path::new(&t.file_path);
            match file_path.canonicalize() {
                Ok(canonical) => {
                    let libraries = sqlx::query_as::<_, Library>("SELECT * FROM libraries")
                        .fetch_all(&data.db)
                        .await
                        .unwrap_or_default();
                    let allowed = libraries.iter().any(|lib| {
                        PathBuf::from(&lib.path)
                            .canonicalize()
                            .map(|p| canonical.starts_with(&p))
                            .unwrap_or(false)
                    });
                    if !allowed {
                        log::warn!("Stream transcoded: path outside libraries: {}", t.file_path);
                        return HttpResponse::Forbidden()
                            .json(serde_json::json!({"error": "File path is outside configured libraries"}));
                    }
                }
                Err(_) => {
                    return HttpResponse::NotFound()
                        .json(serde_json::json!({"error": "File not found"}));
                }
            }

            let output_format = match format.as_str() {
                "aac" => "aac",
                "opus" => "libopus",
                "ogg" => "libvorbis",
                _ => "aac",
            };

            let child = std::process::Command::new("ffmpeg")
                .args([
                    "-hide_banner", "-loglevel", "error",
                    "--",
                    "-i", &t.file_path,
                    "-c:a", output_format,
                    "-b:a", &format!("{}k", bitrate),
                    "-f", "adts",
                    "pipe:1",
                ])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn();

            match child {
                Ok(mut proc) => {
                    let stdout = proc.stdout.take().unwrap_or_else(|| {
                        panic!("stdout should be piped")
                    });
                    let stream = actix_web::web::block(move || {
                        let mut data = Vec::new();
                        use std::io::Read;
                        let mut reader = std::io::BufReader::new(stdout);
                        let _ = reader.read_to_end(&mut data);
                        data
                    }).await.unwrap_or_default();
                    let _ = proc.wait();

                    let content_type = match format.as_str() {
                        "aac" => "audio/aac",
                        "opus" => "audio/opus",
                        "ogg" => "audio/ogg",
                        _ => "audio/aac",
                    };

                    HttpResponse::Ok()
                        .content_type(content_type)
                        .append_header(("Accept-Ranges", "bytes"))
                        .body(stream)
                }
                Err(_) => {
                    stream_track_raw(&data.db, &id, &req).await
                }
            }
        }
        Err(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "Track not found"})),
    }
}

async fn stream_track_raw(db: &SqlitePool, id: &str, req: &HttpRequest) -> HttpResponse {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(id)
        .fetch_one(db)
        .await;

    let track = match track {
        Ok(t) => t,
        Err(_) => {
            return HttpResponse::NotFound().finish();
        }
    };

    let file_path = std::path::Path::new(&track.file_path);

    // Validate the file path is within a configured library directory
    match file_path.canonicalize() {
        Ok(canonical) => {
            let libraries = sqlx::query_as::<_, Library>("SELECT * FROM libraries")
                .fetch_all(db)
                .await
                .unwrap_or_default();
            let allowed = libraries.iter().any(|lib| {
                PathBuf::from(&lib.path)
                    .canonicalize()
                    .map(|p| canonical.starts_with(&p))
                    .unwrap_or(false)
            });
            if !allowed {
                log::warn!("Stream raw: path outside libraries: {}", track.file_path);
                return HttpResponse::Forbidden()
                    .json(serde_json::json!({"error": "File path is outside configured libraries"}));
            }
        }
        Err(_) => {
            return HttpResponse::NotFound().finish();
        }
    }

    if !file_path.exists() {
        return HttpResponse::NotFound().finish();
    }

    let mime = get_mime_type(&track.format);

    match actix_files::NamedFile::open(file_path) {
        Ok(f) => {
            let mut response = f.into_response(req);
            response.headers_mut().insert(
                HeaderName::from_static("accept-ranges"),
                HeaderValue::from_static("bytes"),
            );
            response.headers_mut().insert(
                HeaderName::from_static("content-type"),
                HeaderValue::from_str(mime)
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            );
            response
        }
        Err(_) => HttpResponse::NotFound().finish(),
    }
}

pub async fn health_check(data: web::Data<AppState>) -> HttpResponse {
    let db_ok = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&data.db)
        .await
        .is_ok();
    
    let track_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let library_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let scanning = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM libraries WHERE is_scanning = 1)")
        .fetch_one(&data.db)
        .await
        .unwrap_or(false);

    let version = env!("CARGO_PKG_VERSION");
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": if db_ok { "ok" } else { "degraded" },
        "version": version,
        "database": if db_ok { "connected" } else { "disconnected" },
        "tracks": track_count,
        "libraries": library_count,
        "users": user_count,
        "scanning": scanning,
    }))
}

pub async fn get_database_stats(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) { return e; }
    
    let total_size: i64 = sqlx::query_scalar("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let total_plays: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(play_count), 0) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let total_duration: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(duration_ms), 0) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    let total_size_bytes: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(file_size), 0) FROM tracks")
        .fetch_one(&data.db)
        .await
        .unwrap_or(0);
    
    HttpResponse::Ok().json(serde_json::json!({
        "database_size_bytes": total_size,
        "total_plays": total_plays,
        "total_duration_ms": total_duration,
        "total_size_bytes": total_size_bytes,
    }))
}

// ── Cast Target Handlers ──────────────────────────────────────────

pub async fn list_cast_targets(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let targets = data.cast_targets.lock();
    let list: Vec<&CastTarget> = targets.values().collect();
    HttpResponse::Ok().json(list)
}

pub async fn register_cast_target(
    data: web::Data<AppState>,
    body: web::Json<CastTarget>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let target = body.into_inner();
    let id = uuid::Uuid::new_v4().to_string();
    let mut targets = data.cast_targets.lock();

    let entry = CastTarget {
        id: id.clone(),
        name: target.name,
        host: target.host,
        port: target.port,
        protocol: target.protocol,
        is_connected: false,
        current_track_id: None,
        volume: target.volume,
    };

    targets.insert(id, entry.clone());
    HttpResponse::Created().json(entry)
}

pub async fn unregister_cast_target(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let id = path.into_inner();
    let mut targets = data.cast_targets.lock();
    match targets.remove(&id) {
        Some(_) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "Cast target not found"})),
    }
}

#[allow(clippy::await_holding_lock)]
pub async fn cast_play(
    data: web::Data<AppState>,
    body: web::Json<CastPlayRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let req = body.into_inner();
    let mut targets = data.cast_targets.lock();

    let target = match targets.get_mut(&req.target_id) {
        Some(t) => t,
        None => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "Cast target not found"}))
        }
    };

    target.is_connected = true;
    target.current_track_id = Some(req.track_id.clone());

    let stream_url = format!("/api/tracks/{}/stream", req.track_id);

    let target_info = target.clone();
    drop(targets);

    // Attempt HTTP push to the cast target
    let target_url = format!("http://{}:{}/cast", target_info.host, target_info.port);
    let payload = serde_json::json!({
        "action": "load",
        "url": stream_url,
        "track_id": req.track_id,
        "title": "",
        "content_type": "audio/mpeg",
    });

    match reqwest::Client::new()
        .post(&target_url)
        .timeout(std::time::Duration::from_secs(5))
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) => {
            if resp.status().is_success() {
                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "target": target_info,
                    "stream_url": stream_url,
                }))
            } else {
                log::warn!(
                    "Cast target {} returned status {}",
                    target_info.name,
                    resp.status()
                );
                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "target": target_info,
                    "stream_url": stream_url,
                    "warning": format!("Target returned status {}", resp.status()),
                }))
            }
        }
        Err(e) => {
            log::warn!(
                "Failed to reach cast target {} at {}:{}: {}",
                target_info.name,
                target_info.host,
                target_info.port,
                e
            );
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "target": target_info,
                "stream_url": stream_url,
                "warning": format!("Could not reach target: {}", e),
            }))
        }
    }
}

#[allow(clippy::await_holding_lock)]
pub async fn cast_control(
    data: web::Data<AppState>,
    body: web::Json<CastControlRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let req = body.into_inner();
    let mut targets = data.cast_targets.lock();

    let target = match targets.get_mut(&req.target_id) {
        Some(t) => t,
        None => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({"error": "Cast target not found"}))
        }
    };

    match req.action.as_str() {
        "stop" => {
            target.current_track_id = None;
            target.is_connected = false;
        }
        "volume" => {
            if let Some(v) = req.value {
                target.volume = v.clamp(0.0, 1.0);
            }
        }
        _ => {}
    }

    let target_info = target.clone();
    drop(targets);

    let target_url = format!("http://{}:{}/cast", target_info.host, target_info.port);
    let payload = serde_json::json!({
        "action": req.action,
        "value": req.value,
    });

    match reqwest::Client::new()
        .post(&target_url)
        .timeout(std::time::Duration::from_secs(5))
        .json(&payload)
        .send()
        .await
    {
        Ok(_) => {
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "target": target_info,
            }))
        }
        Err(e) => {
            log::warn!(
                "Failed to send control to cast target {}: {}",
                target_info.name,
                e
            );
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "target": target_info,
                "warning": format!("Could not reach target: {}", e),
            }))
        }
    }
}

// ── Duplicate Detection ───────────────────────────────────────────

pub async fn find_duplicates(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let duplicates = sqlx::query_as::<_, Track>(
        "SELECT t1.* FROM tracks t1 INNER JOIN (SELECT fingerprint, COUNT(*) as cnt FROM tracks WHERE fingerprint IS NOT NULL GROUP BY fingerprint HAVING cnt > 1) t2 ON t1.fingerprint = t2.fingerprint ORDER BY t1.fingerprint LIMIT 1000"
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let mut groups: std::collections::HashMap<String, Vec<Track>> = std::collections::HashMap::new();
    for track in duplicates {
        if let Some(ref fp) = track.fingerprint {
            groups.entry(fp.clone()).or_default().push(track);
        }
    }

    let total_duplicates: usize = groups.values().map(|g| g.len()).sum();

    HttpResponse::Ok().json(serde_json::json!({
        "groups": groups.len(),
        "total_duplicates": total_duplicates,
        "duplicates": groups,
    }))
}

pub async fn find_similar_tracks(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    let duplicates = sqlx::query_as::<_, (String, i64)>(
        "SELECT LOWER(title || '|||' || artist), COUNT(*) as cnt FROM tracks GROUP BY LOWER(title || '|||' || artist) HAVING cnt > 1 ORDER BY cnt DESC LIMIT 100"
    )
    .fetch_all(&data.db)
    .await
    .unwrap_or_default();

    let mut results = Vec::new();
    for (key, count) in duplicates {
        let parts: Vec<&str> = key.split("|||").collect();
        if parts.len() == 2 {
            let tracks = sqlx::query_as::<_, Track>(
                "SELECT * FROM tracks WHERE LOWER(title) = ?1 AND LOWER(artist) = ?2"
            )
            .bind(parts[0])
            .bind(parts[1])
            .fetch_all(&data.db)
            .await
            .unwrap_or_default();

            results.push(serde_json::json!({
                "title": parts[0],
                "artist": parts[1],
                "count": count,
                "tracks": tracks,
            }));
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "groups": results.len(),
        "duplicates": results,
    }))
}

#[derive(serde::Deserialize)]
pub struct DeleteDuplicatesRequest {
    pub track_ids: Vec<String>,
}

pub async fn delete_duplicates_batch(
    data: web::Data<AppState>,
    body: web::Json<DeleteDuplicatesRequest>,
    req: HttpRequest,
) -> HttpResponse {
    if let Err(e) = require_auth(&req) {
        return e;
    }
    if body.track_ids.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "No track IDs provided"}));
    }

    let mut deleted = 0;
    for id in &body.track_ids {
        let result = sqlx::query("DELETE FROM tracks WHERE id = ?")
            .bind(id)
            .execute(&data.db)
            .await;
        if result.is_ok() {
            deleted += 1;
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "deleted": deleted,
        "message": format!("Deleted {} duplicate tracks", deleted),
    }))
}

// ── Auth ──────────────────────────────────────────────────────────

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2.hash_password(password.as_bytes(), &salt)
        .expect("Argon2 hashing should not fail")
        .to_string()
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default().verify_password(password.as_bytes(), &parsed_hash).is_ok()
}

pub fn require_auth(req: &HttpRequest) -> Result<UserInfo, HttpResponse> {
    let token = req.cookie("auth_token")
        .map(|c| c.value().to_string())
        .or_else(|| {
            req.headers().get("Authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(|v| v.to_string())
        });

    match token.and_then(|t| crate::auth::validate_token(&t)) {
        Some(user) => Ok(user),
        None => Err(HttpResponse::Unauthorized().json(serde_json::json!({"error": "Authentication required"}))),
    }
}

pub async fn login_handler(
    data: web::Data<AppState>,
    body: web::Json<LoginRequest>,
    req: HttpRequest,
) -> HttpResponse {
    let ip = req.peer_addr().map(|a| a.to_string()).unwrap_or_else(|| "unknown".to_string());
    if !crate::ratelimit::check_rate_limit(&ip, 10, 60) {
        return HttpResponse::TooManyRequests()
            .json(serde_json::json!({"error": "Too many requests. Please try again later."}));
    }
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?")
        .bind(&body.username)
        .fetch_optional(&data.db)
        .await;

    let user = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            return HttpResponse::Unauthorized()
                .json(serde_json::json!({"error": "Invalid username or password"}))
        }
        Err(e) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": e.to_string()}))
        }
    };

    if !verify_password(&body.password, &user.password_hash) {
        return HttpResponse::Unauthorized()
            .json(serde_json::json!({"error": "Invalid username or password"}));
    }

    let _ = sqlx::query("UPDATE users SET last_login = datetime('now') WHERE id = ?")
        .bind(&user.id)
        .execute(&data.db)
        .await;

    let user_info = UserInfo {
        id: user.id,
        username: user.username,
        role: user.role,
    };
    let token = crate::auth::create_token(&user_info);

    let cookie = actix_web::cookie::Cookie::build("auth_token", &token)
        .path("/")
        .http_only(true)
        .secure(false)
        .max_age(actix_web::cookie::time::Duration::days(7))
        .same_site(actix_web::cookie::SameSite::Lax)
        .finish();

    HttpResponse::Ok()
        .cookie(cookie)
        .json(LoginResponse {
            token,
            user: user_info,
        })
}

pub async fn logout_handler() -> HttpResponse {
    let cookie = actix_web::cookie::Cookie::build("auth_token", "")
        .path("/")
        .http_only(true)
        .secure(false)
        .max_age(actix_web::cookie::time::Duration::seconds(-1))
        .same_site(actix_web::cookie::SameSite::Lax)
        .finish();

    HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({"success": true}))
}

pub async fn get_current_user(req: HttpRequest) -> HttpResponse {
    match require_auth(&req) {
        Ok(user) => HttpResponse::Ok().json(user),
        Err(e) => e,
    }
}

pub async fn create_user(
    data: web::Data<AppState>,
    body: web::Json<CreateUserRequest>,
    req: HttpRequest,
) -> HttpResponse {
    let admin = match require_auth(&req) {
        Ok(u) => u,
        Err(e) => return e,
    };

    if admin.role != "admin" {
        return HttpResponse::Forbidden()
            .json(serde_json::json!({"error": "Admin access required"}));
    }

    let existing = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE username = ?")
        .bind(&body.username)
        .fetch_optional(&data.db)
        .await;

    if let Ok(Some(_)) = existing {
        return HttpResponse::Conflict()
            .json(serde_json::json!({"error": "Username already exists"}));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let password_hash = hash_password(&body.password);
    let role = body.role.as_deref().unwrap_or("user");

    if !["user", "admin", "guest"].contains(&role) {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "Invalid role. Must be one of: user, admin, guest"}));
    }

    let result = sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&body.username)
        .bind(&password_hash)
        .bind(role)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => {
            let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
                .bind(&id)
                .fetch_one(&data.db)
                .await;
            match user {
                Ok(u) => HttpResponse::Created().json(UserInfo {
                    id: u.id,
                    username: u.username,
                    role: u.role,
                }),
                Err(e) => HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": e.to_string()})),
            }
        }
        Err(e) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn list_users(data: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    let admin = match require_auth(&req) {
        Ok(u) => u,
        Err(e) => return e,
    };

    if admin.role != "admin" {
        return HttpResponse::Forbidden()
            .json(serde_json::json!({"error": "Admin access required"}));
    }

    let users = sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY created_at")
        .fetch_all(&data.db)
        .await;

    match users {
        Ok(users) => {
            let infos: Vec<UserInfo> = users.into_iter().map(|u| UserInfo {
                id: u.id,
                username: u.username,
                role: u.role,
            }).collect();
            HttpResponse::Ok().json(infos)
        }
        Err(e) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn delete_user(
    data: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let admin = match require_auth(&req) {
        Ok(u) => u,
        Err(e) => return e,
    };

    if admin.role != "admin" {
        return HttpResponse::Forbidden()
            .json(serde_json::json!({"error": "Admin access required"}));
    }

    let user_id = path.into_inner();

    if user_id == admin.id {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "Cannot delete your own account"}));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&user_id)
        .execute(&data.db)
        .await;

    match result {
        Ok(r) => {
            if r.rows_affected() == 0 {
                HttpResponse::NotFound().json(serde_json::json!({"error": "User not found"}))
            } else {
                HttpResponse::Ok().json(serde_json::json!({"success": true}))
            }
        }
        Err(e) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn register_handler(
    data: web::Data<AppState>,
    body: web::Json<CreateUserRequest>,
    req: HttpRequest,
) -> HttpResponse {
    let ip = req.peer_addr().map(|a| a.to_string()).unwrap_or_else(|| "unknown".to_string());
    if !crate::ratelimit::check_rate_limit(&ip, 10, 60) {
        return HttpResponse::TooManyRequests()
            .json(serde_json::json!({"error": "Too many requests. Please try again later."}));
    }
    if body.username.trim().is_empty() || body.username.len() < 3 {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Username must be at least 3 characters"}));
    }
    if body.username.len() > 50 {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Username must be 50 characters or fewer"}));
    }
    if body.password.is_empty() || body.password.len() < 4 {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Password must be at least 4 characters"}));
    }
    if body.password.len() > 128 {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Password must be 128 characters or fewer"}));
    }
    let existing = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE username = ?")
        .bind(&body.username)
        .fetch_optional(&data.db)
        .await;

    if let Ok(Some(_)) = existing {
        return HttpResponse::Conflict()
            .json(serde_json::json!({"error": "Username already exists"}));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let password_hash = hash_password(&body.password);

    let result = sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'user')")
        .bind(&id)
        .bind(&body.username)
        .bind(&password_hash)
        .execute(&data.db)
        .await;

    match result {
        Ok(_) => {
            let user_info = UserInfo {
                id,
                username: body.username.clone(),
                role: "user".to_string(),
            };
            let token = crate::auth::create_token(&user_info);

            let cookie = actix_web::cookie::Cookie::build("auth_token", &token)
                .path("/")
                .http_only(true)
                .secure(false)
                .max_age(actix_web::cookie::time::Duration::days(7))
                .same_site(actix_web::cookie::SameSite::Lax)
                .finish();

            HttpResponse::Created()
                .cookie(cookie)
                .json(LoginResponse {
                    token,
                    user: user_info,
                })
        }
        Err(e) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": e.to_string()})),
    }
}

pub async fn guest_login_handler(
    data: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let ip = req.peer_addr().map(|a| a.to_string()).unwrap_or_else(|| "unknown".to_string());
    if !crate::ratelimit::check_rate_limit(&ip, 10, 60) {
        return HttpResponse::TooManyRequests()
            .json(serde_json::json!({"error": "Too many requests. Please try again later."}));
    }
    let guest_username = "guest";
    let guest_id = "guest";

    // Check if guest user exists; create if not
    let existing = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE username = ?")
        .bind(guest_username)
        .fetch_optional(&data.db)
        .await;

    if existing.unwrap_or(None).is_none() {
        let _ = sqlx::query("INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, '', 'guest')")
            .bind(guest_id)
            .bind(guest_username)
            .execute(&data.db)
            .await;
    }

    let user_info = UserInfo {
        id: guest_id.to_string(),
        username: guest_username.to_string(),
        role: "guest".to_string(),
    };
    let token = crate::auth::create_guest_token();

    let cookie = actix_web::cookie::Cookie::build("auth_token", &token)
        .path("/")
        .http_only(true)
        .secure(false)
        .max_age(actix_web::cookie::time::Duration::hours(24))
        .same_site(actix_web::cookie::SameSite::Lax)
        .finish();

    HttpResponse::Ok()
        .cookie(cookie)
        .json(LoginResponse {
            token,
            user: user_info,
        })
}
