import { useCallback, useEffect, useRef, useState } from "react";
import {
  IoPlaySharp,
  IoPlayForwardSharp,
  IoPlayBackSharp,
  IoMusicalNotesSharp,
  IoPauseSharp,
} from "react-icons/io5";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";

type Progress = [number, number, number];
type Status = "Running" | "Stopped" | "Paused";
type Track = {
  file: string;
};

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = time % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

const App = () => {
  const divExcludingCoverRef = useRef<HTMLDivElement>(null);
  const divProgressBarRef = useRef<HTMLDivElement>(null);
  const [coverSize, setCoverSize] = useState(0);
  const [progress, setProgress] = useState<Progress>([0, 0, 0]);
  const progressRef = useRef<Progress>(progress);
  const [isDraggingProgressBar, setIsDraggingProgressBar] = useState(false);
  const isDraggingProgressBarRef = useRef(isDraggingProgressBar);
  const isRightAfterSeekRef = useRef(false);
  const isEndOfSong = useRef(false);
  const [playlistItems, setPlaylistItems] = useState<Track[]>([]);
  const playlistItemsRef = useRef<Track[]>(playlistItems);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(0);
  const currentSongIndexRef = useRef(currentSongIndex);
  const [status, setStatus] = useState<Status>("Stopped");
  const statusRef = useRef<Status>(status);
  const requestIdRef = useRef(0);

  const play = useCallback((path: String) => {
    const _ = invoke("play", { path });
    setStatus("Running");
  }, []);

  const pause = useCallback(() => {
    const _ = invoke("pause");
    setStatus("Paused");
  }, []);

  const resume = useCallback(() => {
    const _ = invoke("resume");
    setStatus("Running");
  }, []);

  const stop = useCallback(() => {
    const _ = invoke("stop");
  }, []);

  const seekTo = useCallback((time: number) => {
    const _ = invoke("seek_to", { time });
  }, []);

  const getIsPaused = useCallback(() => invoke("is_paused"), []);

  const getProgress = useCallback(() => invoke("get_progress"), []);

  useEffect(() => {
    playlistItemsRef.current = playlistItems;
  }, [playlistItems]);

  useEffect(() => {
    currentSongIndexRef.current = currentSongIndex;
  }, [currentSongIndex]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isDraggingProgressBarRef.current = isDraggingProgressBar;
  }, [isDraggingProgressBar]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    requestIdRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestIdRef.current);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const divExcludingCoverHeight =
        divExcludingCoverRef.current?.offsetHeight ?? 0;
      const newCoverSize = Math.min(
        window.innerWidth,
        window.innerHeight - divExcludingCoverHeight
      );
      setCoverSize(newCoverSize);
    };

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();

      if (divProgressBarRef.current && isDraggingProgressBarRef.current) {
        const mouseX = event.clientX;
        const { x: progressBarX, width: progressBarWidth } =
          divProgressBarRef.current.getBoundingClientRect();
        const duration = progressRef.current[2];
        const time =
          mouseX <= progressBarX
            ? 0
            : mouseX >= progressBarX + progressBarWidth
            ? duration
            : Math.floor(
                ((mouseX - progressBarX) / progressBarWidth) * duration
              );
        setProgress([(time / duration) * 100, time, duration]);
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      setIsDraggingProgressBar(false);

      if (divProgressBarRef.current && isDraggingProgressBarRef.current) {
        const mouseX = event.clientX;
        const { x: progressBarX, width: progressBarWidth } =
          divProgressBarRef.current.getBoundingClientRect();
        const duration = progressRef.current[2];
        const time =
          mouseX <= progressBarX
            ? 0
            : mouseX >= progressBarX + progressBarWidth
            ? duration
            : Math.floor(
                ((mouseX - progressBarX) / progressBarWidth) * duration
              );

        seekTo(time);
        if (isEndOfSong.current && statusRef.current !== "Running") {
          resume();
        }
        setProgress([(time / duration) * 100, time, duration]);

        // Since the elapsed time is updated by player every 50ms,
        // the time before the seek is obtained from player during that time.
        // Therefore, set the flag to true so that the elapsed time is not got from
        // the player for a short period of time after the seek.
        isRightAfterSeekRef.current = true;
        setTimeout(() => {
          isRightAfterSeekRef.current = false;
        }, 100);
      }
    };

    document.body.classList.add("bg-gray-900");

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const playerNext = () => {
    if (!playlistItemsRef.current.length) {
      stop();
      setCurrentSongIndex(0);
      return;
    }

    const newCurrentSongIndex =
      currentSongIndexRef.current < playlistItemsRef.current.length - 1
        ? currentSongIndexRef.current + 1
        : 0;

    const song = playlistItemsRef.current[newCurrentSongIndex];
    play(song.file);
    setCurrentSongIndex(newCurrentSongIndex);
  };

  const playerPrevious = () => {
    if (!playlistItemsRef.current.length) {
      stop();
      setCurrentSongIndex(0);
      return;
    }

    const newCurrentSongIndex =
      progressRef.current[1] >= 3
        ? currentSongIndexRef.current
        : currentSongIndexRef.current > 0
        ? currentSongIndexRef.current - 1
        : playlistItemsRef.current.length - 1;

    const song = playlistItemsRef.current[newCurrentSongIndex];
    play(song.file);
    setCurrentSongIndex(newCurrentSongIndex);
  };

  const playerTogglePause = () => {
    if (playlistItemsRef.current.length) {
      getIsPaused().then((isPaused) => (isPaused ? resume() : pause()));
    }
  };

  const progressUpdate = () => {
    getProgress()
      .then((progress) => {
        const [_, timePos, duration] = progress as Progress;

        if (timePos >= duration) {
          pause();
          isEndOfSong.current = true;
          setProgress([(timePos / duration) * 100, timePos, duration]);
          // playerNext();
        } else {
          isEndOfSong.current = false;
          setProgress([(timePos / duration) * 100, timePos, duration]);
        }
      })
      .catch();
  };

  const animate = () => {
    if (!isDraggingProgressBarRef.current && !isRightAfterSeekRef.current) {
      progressUpdate();
    }

    if (statusRef.current === "Stopped") {
      playerNext();
    }

    requestIdRef.current = requestAnimationFrame(animate);
  };

  const openDialog = () => {
    open().then((files) => {
      if (files) {
        // TODO: files type check
        if (typeof files == "string") {
          const newSong = { file: files };
          const newPlaylistItems = [...playlistItems, newSong];
          setPlaylistItems(newPlaylistItems);
        } else {
          const newSongs = files.map((file) => {
            return { file };
          });
          const newPlaylistItems = [...playlistItems, ...newSongs];
          setPlaylistItems(newPlaylistItems);
        }
      }
    });
  };

  const handleMouseDownProgressBar = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    setIsDraggingProgressBar(true);

    const mouseX = event.clientX;
    const { x: progressBarX, width: progressBarWidth } =
      event.currentTarget.getBoundingClientRect();
    const duration = progress[2];
    const time =
      mouseX <= progressBarX
        ? 0
        : mouseX >= progressBarX + progressBarWidth
        ? duration
        : Math.floor(((mouseX - progressBarX) / progressBarWidth) * duration);
    setProgress([(time / duration) * 100, time, duration]);
  };

  return (
    <div className="relative">
      <div data-tauri-drag-region className="absolute w-full h-7" />
      <div className="flex flex-col h-screen overflow-hidden">
        <div className=" flex-1 flex justify-center items-center">
          <div
            style={{ width: coverSize, height: coverSize }}
            className="p-8 mt-2"
          >
            <div className="h-full bg-gray-800 flex justify-center items-center">
              <IoMusicalNotesSharp
                className="text-gray-500 -translate-x-[5%] hover:cursor-grab"
                size="75%"
                onClick={openDialog}
              />
            </div>
          </div>
        </div>
        <div ref={divExcludingCoverRef}>
          <div className="flex justify-center items-center">
            <div className="break-all mx-8 font-bold flex text-3xl text-gray-100 justify-center items-center">
              MONTERO (Call Me By Your Name)
            </div>
          </div>
          <div className="break-all mx-8 mb-4 flex text-lg text-gray-500 justify-center items-center">
            Lil Nas X
          </div>
          <div className="mx-8">
            <div className="group relative w-full ">
              <div
                ref={divProgressBarRef}
                className="py-2"
                onMouseDown={handleMouseDownProgressBar}
              >
                <div className="rounded-full w-full h-1 bg-gray-500 absolute top-0 bottom-0 left-0 right-0 m-auto" />
              </div>
              <div
                style={{ width: `${progress[0]}%` }}
                className={`rounded-full h-1 bg-gray-300 group-hover:bg-cyan-500 absolute top-0 bottom-0 left-0 my-auto pointer-events-none ${
                  isDraggingProgressBar && "bg-cyan-500"
                }`}
              />
              <div
                style={{ left: `${progress[0]}%` }}
                className={`rounded-full w-4 h-4 bg-gray-300 opacity-0 group-hover:opacity-100 absolute top-0 bottom-0 my-auto -translate-x-[50%] pointer-events-none ${
                  isDraggingProgressBar && "opacity-100"
                }`}
              />
            </div>
            <div className="flex">
              <div className="text-gray-500 text-sm">
                {formatTime(progress[1])}
              </div>
              <div className="text-gray-500 text-sm ml-auto">
                {formatTime(progress[2])}
              </div>
            </div>
          </div>
          <div className="p-8 pt-4 flex justify-center items-center">
            <button
              className="cursor-default text-4xl text-gray-300 enabled:hover:text-gray-50 enabled:hover:scale-105 active:text-gray-300 active:scale-100 disabled:text-gray-800"
              onClick={playerPrevious}
              disabled={status === "Stopped"}
            >
              <IoPlayBackSharp />
            </button>
            <button
              className="mx-16 text-5xl translate-x-1 cursor-default text-gray-300 enabled:hover:text-white enabled:hover:scale-105 active:text-gray-300 active:scale-100 disabled:text-gray-800"
              onClick={playerTogglePause}
              disabled={status === "Stopped"}
            >
              {status === "Running" ? <IoPauseSharp /> : <IoPlaySharp />}
            </button>
            <button
              className="cursor-default text-4xl text-gray-300 enabled:hover:text-white enabled:hover:scale-105 active:text-gray-300 active:scale-100 disabled:text-gray-800"
              onClick={playerNext}
              disabled={status === "Stopped"}
            >
              <IoPlayForwardSharp />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
