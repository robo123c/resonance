export interface ResonanceUser {
  id: string;
  username: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: ResonanceUser;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration_ms: number;
  file_name: string;
  format: string;
  has_artwork: boolean;
  play_count: number;
}

export interface TrackPage {
  items: Track[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ResonanceStats {
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  total_duration_ms: number;
  total_size_bytes: number;
  top_artists: Array<{ name: string; track_count: number }>;
}

export interface SearchResults {
  tracks: Track[];
  albums: Array<{ id: string; title: string; artist: string; track_count: number }>;
  artists: Array<{ id: string; name: string; track_count: number }>;
}
