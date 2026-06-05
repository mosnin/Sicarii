"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// UnicornStudio touches window/document at runtime — load it client-only so it
// never executes during SSR.
const UnicornScene = dynamic(() => import("unicornstudio-react"), { ssr: false });

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
};

export const Component = () => {
  const { width, height } = useWindowSize();

  return (
    <div className={cn("flex flex-col items-center")}>
      <UnicornScene
        production={true}
        projectId="p5QklSow4i1QBGKNXxiH"
        width={width}
        height={height}
      />
    </div>
  );
};
