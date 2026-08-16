import type { Track } from "@/lib/resonance/types";

export type MusicCard = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  kind?: "album" | "playlist" | "station" | "artist";
};

const art = (id: string, width = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=82`;

export const tracks: Track[] = [
  { id: "t1", title: "Midnight City Lights", artist: "The Coastline", album: "Afterglow", duration_ms: 228000, file_name: "midnight-city-lights.mp3", format: "mp3", has_artwork: true, play_count: 182, artwork: art("photo-1519608487953-e999c86e7455"), genre: "Alternative", year: 2024, lyrics: ["Neon on the avenue", "We are wide awake", "Every color moving through", "Every step we take"] },
  { id: "t2", title: "Slow Motion", artist: "Maya Vale", album: "Soft Focus", duration_ms: 196000, file_name: "slow-motion.mp3", format: "mp3", has_artwork: true, play_count: 94, artwork: art("photo-1492684223066-81342ee5ff30"), genre: "Pop", year: 2025, lyrics: ["Take it in slow motion", "Let the silence bloom", "We can make a little ocean", "In this crowded room"] },
  { id: "t3", title: "Golden Hour", artist: "Juniper Park", album: "Golden Hour", duration_ms: 242000, file_name: "golden-hour.mp3", format: "mp3", has_artwork: true, play_count: 76, artwork: art("photo-1500534623283-312aade485b7"), genre: "Indie", year: 2023, lyrics: ["Meet me in the golden hour", "Where the shadows disappear", "Hold the world a little softer", "Keep me close and keep me here"] },
  { id: "t4", title: "Paper Planes", artist: "Northbound", album: "Open Skies", duration_ms: 211000, file_name: "paper-planes.mp3", format: "mp3", has_artwork: true, play_count: 61, artwork: art("photo-1493246507139-91e8fad9978e"), genre: "Indie Rock", year: 2024 },
  { id: "t5", title: "Blue Room", artist: "Luna Hart", album: "Blue Room", duration_ms: 185000, file_name: "blue-room.mp3", format: "mp3", has_artwork: true, play_count: 44, artwork: art("photo-1493225457124-a3eb161ffa5f"), genre: "R&B", year: 2024 },
  { id: "t6", title: "Keep Moving", artist: "The Coastline", album: "Afterglow", duration_ms: 203000, file_name: "keep-moving.mp3", format: "mp3", has_artwork: true, play_count: 38, artwork: art("photo-1514525253161-7a46d19cd819"), genre: "Alternative", year: 2024 },
  { id: "t7", title: "Sunday Morning", artist: "Maya Vale", album: "Soft Focus", duration_ms: 226000, file_name: "sunday-morning.mp3", format: "mp3", has_artwork: true, play_count: 31, artwork: art("photo-1506157786151-b8491531f063"), genre: "Pop", year: 2025 },
  { id: "t8", title: "Into the Wild", artist: "Juniper Park", album: "Golden Hour", duration_ms: 255000, file_name: "into-the-wild.mp3", format: "mp3", has_artwork: true, play_count: 28, artwork: art("photo-1500530855697-b586d89ba3ee"), genre: "Indie", year: 2023 },
  { id: "t9", title: "Velvet", artist: "Luna Hart", album: "Blue Room", duration_ms: 214000, file_name: "velvet.mp3", format: "mp3", has_artwork: true, play_count: 22, artwork: art("photo-1516280440614-37939bbacd81"), genre: "R&B", year: 2024 },
  { id: "t10", title: "North Star", artist: "Northbound", album: "Open Skies", duration_ms: 233000, file_name: "north-star.mp3", format: "mp3", has_artwork: true, play_count: 19, artwork: art("photo-1464822759023-fed622ff2c3b"), genre: "Indie Rock", year: 2024 },
];

export const albums: MusicCard[] = [
  { id: "a1", title: "Afterglow", subtitle: "The Coastline", artwork: art("photo-1519608487953-e999c86e7455"), kind: "album" },
  { id: "a2", title: "Soft Focus", subtitle: "Maya Vale", artwork: art("photo-1492684223066-81342ee5ff30"), kind: "album" },
  { id: "a3", title: "Golden Hour", subtitle: "Juniper Park", artwork: art("photo-1500534623283-312aade485b7"), kind: "album" },
  { id: "a4", title: "Blue Room", subtitle: "Luna Hart", artwork: art("photo-1493225457124-a3eb161ffa5f"), kind: "album" },
  { id: "a5", title: "Open Skies", subtitle: "Northbound", artwork: art("photo-1493246507139-91e8fad9978e"), kind: "album" },
];

export const playlists: MusicCard[] = [
  { id: "p1", title: "Chill Mix", subtitle: "Made for Blake", artwork: art("photo-1519681393784-d120267933ba"), kind: "playlist" },
  { id: "p2", title: "New in Alternative", subtitle: "Apple Music", artwork: art("photo-1493225457124-a3eb161ffa5f"), kind: "playlist" },
  { id: "p3", title: "Focus Flow", subtitle: "Curated for you", artwork: art("photo-1482192596544-9eb780fc7f66"), kind: "playlist" },
  { id: "p4", title: "Late Night Drive", subtitle: "Essentials", artwork: art("photo-1470214304380-aadaedcfff1b"), kind: "playlist" },
  { id: "p5", title: "Pure Workout", subtitle: "Apple Music Fitness", artwork: art("photo-1517836357463-d25dfeac3438"), kind: "playlist" },
];

export const artists: MusicCard[] = [
  { id: "ar1", title: "The Coastline", subtitle: "Artist", artwork: art("photo-1493225457124-a3eb161ffa5f"), kind: "artist" },
  { id: "ar2", title: "Maya Vale", subtitle: "Artist", artwork: art("photo-1516280440614-37939bbacd81"), kind: "artist" },
  { id: "ar3", title: "Juniper Park", subtitle: "Artist", artwork: art("photo-1506157786151-b8491531f063"), kind: "artist" },
  { id: "ar4", title: "Luna Hart", subtitle: "Artist", artwork: art("photo-1514525253161-7a46d19cd819"), kind: "artist" },
];

export const stations: MusicCard[] = [
  { id: "s1", title: "Alt CTRL Radio", subtitle: "Hosted by Apple Music", artwork: art("photo-1470229722913-7c0e2dbbafd3"), kind: "station" },
  { id: "s2", title: "The Chill Station", subtitle: "Ambient · Downtempo", artwork: art("photo-1519681393784-d120267933ba"), kind: "station" },
  { id: "s3", title: "New Music Daily", subtitle: "The best new songs", artwork: art("photo-1492684223066-81342ee5ff30"), kind: "station" },
];

export const featuredTrack = tracks[0];
export const recentlyPlayed = [tracks[0], tracks[2], tracks[4], tracks[6]];
export const madeForYou = [playlists[0], playlists[2], playlists[3]];
export const genres = ["Alternative", "Pop", "Indie", "R&B", "Hip-Hop", "Electronic", "Jazz", "Classical"];

export function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function tracksForCard(card: MusicCard) {
  if (card.kind === "album") return tracks.filter((track) => track.album === card.title);
  return tracks;
}
