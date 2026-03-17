import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { appPhaseAtom } from "../../store/zora";

export function AwakeningComplete() {
  const setAppPhase = useSetAtom(appPhaseAtom);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setFadeOut(true), 700);
    const transTimer = setTimeout(() => setAppPhase("chat"), 1100);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(transTimer);
    };
  }, [setAppPhase]);

  return (
    <main
      className={`h-screen overflow-hidden bg-[#f5f3f0] flex flex-col items-center 
                  justify-center transition-opacity duration-600
                  ${fadeOut ? "opacity-0" : "opacity-100"}`}
    >
      <div className="titlebar-drag-region fixed left-0 right-0 top-0 z-50 h-[50px]"
        style={{ pointerEvents: "none" }} />

      <div
        className="w-20 h-20 rounded-full mb-6"
        style={{
          background: "radial-gradient(circle, rgba(251,191,36,0.4) 0%, rgba(253,186,116,0.15) 50%, transparent 70%)",
        }}
      />

      <p className="text-stone-500 text-[15px] animate-fade-in">
        开始我们的旅程吧。
      </p>
    </main>
  );
}
