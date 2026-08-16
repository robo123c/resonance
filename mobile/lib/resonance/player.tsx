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

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => () => player.remove(), [player]);

  const start = useCallback(async (track: Track, nextQueue: Track[], index: number) => {
    if (!api || !token) throw new Error("Sign in to start playback.");
    player.replace({
      uri: api.streamUrl(track.id),
      headers: api.authorizationHeaders(),
    });
    player.play();
    setCurrentTrack(track);
    setQueue(nextQueue);
    setQueueIndex(index);
    void api.recordPlay(track.id).catch(() => undefined);
  }, [api, player, token]);

  const playTrack = useCallback(async (track: Track, suppliedQueue?: Track[]) => {
    const nextQueue = suppliedQueue?.length ? suppliedQueue : [track];
    const index = Math.max(nextQueue.findIndex((item) => item.id === track.id), 0);
    await start(track, nextQueue, index);
  }, [start]);

  const toggle = useCallback(() => {
    if (!currentTrack) return;
    if (status.playing) player.pause();
    else player.play();
  }, [currentTrack, player, status.playing]);

  const next = useCallback(async () => {
    if (!queue.length) return;
    const index = Math.min(queueIndex + 1, queue.length - 1);
    if (index === queueIndex) return;
    await start(queue[index], queue, index);
  }, [queue, queueIndex, start]);

  const previous = useCallback(async () => {
    if (!queue.length) return;
    const index = Math.max(queueIndex - 1, 0);
    if (index === queueIndex) {
      await player.seekTo(0);
      return;
    }
    await start(queue[index], queue, index);
  }, [player, queue, queueIndex, start]);

  const seek = useCallback(async (seconds: number) => {
    await player.seekTo(Math.max(0, seconds));
  }, [player]);

  const value = useMemo<PlayerValue>(() => ({
    currentTrack,
    queue,
    queueIndex,
    isPlaying: status.playing,
    position: status.currentTime ?? 0,
    duration: status.duration ?? 0,
    playTrack,
    toggle,
    next,
    previous,
    seek,
  }), [currentTrack, next, playTrack, previous, queue, queueIndex, seek, status.currentTime, status.duration, status.playing, toggle]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useResonancePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("useResonancePlayer must be used inside ResonancePlayerProvider");
  return value;
}
