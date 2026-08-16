import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useResonanceSession } from "./session";
import type { Track } from "./types";

interface PlayerValue {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  toggle: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function ResonancePlayerProvider({ children }: { children: ReactNode }) {
  const { api, token } = useResonanceSession();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [mockPlaying, setMockPlaying] = useState(false);
  const [mockPosition, setMockPosition] = useState(0);
  const [mockDuration, setMockDuration] = useState(0);

  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true }); }, []);
  useEffect(() => () => player.remove(), [player]);
  useEffect(() => {
    if (api || !mockPlaying || !currentTrack) return;
    const timer = setInterval(() => setMockPosition((value) => {
      const next = value + 1;
      return next >= mockDuration ? 0 : next;
    }), 1000);
    return () => clearInterval(timer);
  }, [api, currentTrack, mockDuration, mockPlaying]);

  const start = useCallback(async (track: Track, nextQueue: Track[], index: number) => {
    if (api && token) {
      player.replace({ uri: api.streamUrl(track.id), headers: api.authorizationHeaders() });
      player.play();
      setMockPlaying(false);
      void api.recordPlay(track.id).catch(() => undefined);
    } else {
      setMockDuration(Math.max(1, Math.round(track.duration_ms / 1000)));
      setMockPosition(0);
      setMockPlaying(true);
    }
    setCurrentTrack(track);
    setQueue(nextQueue);
    setQueueIndex(index);
  }, [api, player, token]);

  const playTrack = useCallback(async (track: Track, suppliedQueue?: Track[]) => {
    const nextQueue = suppliedQueue?.length ? suppliedQueue : [track];
    const index = Math.max(nextQueue.findIndex((item) => item.id === track.id), 0);
    await start(track, nextQueue, index);
  }, [start]);

  const toggle = useCallback(() => {
    if (!currentTrack) return;
    if (api) {
      if (status.playing) player.pause(); else player.play();
    } else setMockPlaying((value) => !value);
  }, [api, currentTrack, player, status.playing]);

  const next = useCallback(async () => {
    if (!queue.length) return;
    const index = queueIndex + 1 >= queue.length ? 0 : queueIndex + 1;
    await start(queue[index], queue, index);
  }, [queue, queueIndex, start]);

  const previous = useCallback(async () => {
    if (!queue.length) return;
    if (!api && mockPosition > 3) { setMockPosition(0); return; }
    const index = queueIndex - 1 < 0 ? queue.length - 1 : queueIndex - 1;
    await start(queue[index], queue, index);
  }, [api, mockPosition, queue, queueIndex, start]);

  const seek = useCallback(async (seconds: number) => {
    if (api) await player.seekTo(Math.max(0, seconds));
    else setMockPosition(Math.max(0, Math.min(seconds, mockDuration)));
  }, [api, mockDuration, player]);

  const value = useMemo<PlayerValue>(() => ({ currentTrack, queue, queueIndex, isPlaying: api ? status.playing : mockPlaying, position: api ? status.currentTime ?? 0 : mockPosition, duration: api ? (status.duration ?? (currentTrack ? currentTrack.duration_ms / 1000 : 0)) : mockDuration, playTrack, toggle, next, previous, seek }), [api, currentTrack, mockDuration, mockPlaying, mockPosition, next, playTrack, previous, queue, queueIndex, seek, status.currentTime, status.duration, status.playing, toggle]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useResonancePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("useResonancePlayer must be used inside ResonancePlayerProvider");
  return value;
}
