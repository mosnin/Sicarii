"use client";

import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GrCursor } from "react-icons/gr";
import { useGSAP } from "@gsap/react";
import { RiTwitterXFill } from "react-icons/ri";
import { SiAnthropic } from "react-icons/si";
import { BsOpenai } from "react-icons/bs";

type NotificationCardItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
};

const notificationItems: NotificationCardItem[] = [
  {
    id: "item1",
    icon: <BsOpenai className="text-primary size-5.5" />,
    title: "ChatGPT Update",
    description: "GPT-4o now for free",
    time: "14 hrs ago",
  },
  {
    id: "item2",
    icon: <RiTwitterXFill className="text-primary size-5.5" />,
    title: "New Follower",
    description: "@elonmusk followed you",
    time: "11 hrs ago",
  },
  {
    id: "item3",
    icon: <SiAnthropic className="text-primary size-5.5" />,
    title: "Claude Upgrade",
    description: "Claude 3.5 is live",
    time: "7 hrs ago",
  },
];

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function FitScale({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={ref}
      className="relative flex w-full justify-center overflow-hidden"
      style={{ height: (scale || 1) * height, visibility: scale ? "visible" : "hidden" }}
    >
      <div
        className="relative shrink-0"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const NotifyStack = ({
  notificationCardItems = notificationItems,
}: {
  notificationCardItems?: NotificationCardItem[];
}) => {
  const cursorRef = useRef(null);
  const notificationCenterRef = useRef(null);
  const readButtonRef = useRef(null);
  const notification1Ref = useRef(null);
  const notification2Ref = useRef(null);
  const notification3Ref = useRef(null);

  useGSAP(() => {
    const ctx = gsap.context(() => {
      gsap.set(notification1Ref.current, { y: 120, opacity: 0, scale: 0.5 });
      gsap.set(notification2Ref.current, { y: 80, opacity: 0, scale: 0.5 });
      gsap.set(notification3Ref.current, { y: 40, opacity: 0, scale: 0.5 });
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
      tl.to(cursorRef.current, {
        x: -90,
        y: 105,
        duration: 0.75,
        ease: "sine.inOut",
      });
      tl.to(cursorRef.current, {
        scale: 0.8,
        duration: 0.1,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
      });
      tl.to(notificationCenterRef.current, {
        y: 70,
        width: 280,
        duration: 0.4,
        ease: "sine.inOut",
      });
      tl.to(
        cursorRef.current,
        {
          x: 10,
          y: 105,
          duration: 0.75,
          delay: 0.15,
          ease: "sine.inOut",
        },
        "<",
      );
      tl.to(
        readButtonRef.current,
        {
          opacity: 1,
          duration: 0.3,
          delay: 0.2,
          ease: "power1.inOut",
        },
        "<",
      );
      tl.to(notification1Ref.current, { y: 0, opacity: 1, scale: 1 });
      tl.to(notification2Ref.current, { y: 0, opacity: 1, scale: 0.95 });
      tl.to(notification3Ref.current, { y: 0, opacity: 1, scale: 0.9 });
      tl.to(cursorRef.current, {
        x: -20,
        y: 175,
        duration: 0.75,
        ease: "sine.inOut",
      });
      tl.to(cursorRef.current, {
        scale: 0.8,
        duration: 0.1,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
      });
      tl.to(
        readButtonRef.current,
        {
          opacity: 0.75,
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        "<",
      );

      tl.to(notification1Ref.current, { x: 100, opacity: 0, duration: 0.4 });
      tl.to(
        notification2Ref.current,
        {
          y: -40,
          scale: 1,
          delay: 0.3,
          duration: 0.4,
          ease: "sine.inOut",
        },
        "<",
      );
      tl.to(
        notification3Ref.current,
        {
          y: -40,
          scale: 0.95,
          delay: 0.3,
          duration: 0.4,
          ease: "sine.inOut",
        },
        "<",
      );
      tl.to(notification2Ref.current, {
        x: 100,
        opacity: 0,
        delay: 0.2,
        duration: 0.4,
      });
      tl.to(
        notification3Ref.current,
        {
          y: -80,
          scale: 1,
          delay: 0.4,
          duration: 0.4,
          ease: "sine.inOut",
        },
        "<",
      );
      tl.to(notification3Ref.current, {
        x: 100,
        opacity: 0,
        delay: 0.2,
        duration: 0.4,
      });
      tl.to(cursorRef.current, {
        x: 0,
        y: 0,
        delay: 0.3,
        duration: 0.75,
        ease: "sine.inOut",
      });
      tl.to(notificationCenterRef.current, {
        y: 0,
        width: 140,
        duration: 0.5,
        ease: "sine.inOut",
      });
      tl.to(
        readButtonRef.current,
        { opacity: 0, duration: 0.3, ease: "power1.inOut" },
        "<",
      );
    });

    return () => ctx.revert();
  });

  return (
    <FitScale width={400} height={268}>
      <div className="relative mx-auto flex h-full w-full max-w-100 items-center gap-1 px-1">
        <div className="absolute top-0 left-0 h-full w-full p-2">
          <div className="relative h-full w-full">
            <Card
              innerRef={notification3Ref}
              top="top-[100px]"
              icon={notificationCardItems[2].icon}
              title={notificationCardItems[2].title}
              description={notificationCardItems[2].description}
              time={notificationCardItems[2].time}
            />

            <Card
              innerRef={notification2Ref}
              top="top-[70px]"
              icon={notificationCardItems[1].icon}
              title={notificationCardItems[1].title}
              description={notificationCardItems[1].description}
              time={notificationCardItems[1].time}
            />

            <Card
              innerRef={notification1Ref}
              top="top-[40px]"
              icon={notificationCardItems[0].icon}
              title={notificationCardItems[0].title}
              description={notificationCardItems[0].description}
              time={notificationCardItems[0].time}
            />
            <div
              ref={notificationCenterRef}
              className={cn(
                "absolute inset-x-0 top-25 mx-auto",
                "flex h-8 w-35 items-center justify-between",
                "rounded-sm border border-neutral-200 dark:border-neutral-800/50",
                "bg-neutral-50 dark:bg-neutral-950",
              )}
            >
              <div className="relative top-0 left-0 h-full w-70 rounded-sm">
                <div className="absolute top-0 left-2 flex h-full w-full items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-yellow-500"></span>
                  <p className="text-primary/80 text-xs">3 New Notifications</p>
                </div>
                <div
                  ref={readButtonRef}
                  className={cn(
                    "absolute top-0.5 right-0.5",
                    "flex h-[90%] w-22.5 items-center justify-center",
                    "text-primary/90 rounded-sm px-1 text-[10px] opacity-0",
                    "bg-neutral-200 dark:bg-neutral-800",
                  )}
                >
                  Mark as read
                </div>
              </div>
            </div>
          </div>
          <div
            ref={cursorRef}
            className="absolute top-4 right-7 flex items-center"
          >
            <span className="text-neutral-700 dark:text-neutral-200">
              <GrCursor className="size-5.5" />
            </span>
          </div>
        </div>
      </div>
    </FitScale>
  );
};

export default NotifyStack;

type CardProps = {
  innerRef?: React.Ref<HTMLDivElement>;
  top: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
};

function Card({ innerRef, top, icon, title, description, time }: CardProps) {
  return (
    <div
      ref={innerRef}
      className={cn(
        `absolute inset-x-0 mx-auto flex h-15 w-full max-w-72.5 scale-[0.5] items-center justify-between rounded-sm border border-neutral-200 bg-neutral-50 px-2 opacity-0 dark:border-neutral-800/50 dark:bg-neutral-950 ${top}`,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-neutral-50 dark:bg-[#141414]">
          {icon}
        </span>
        <div className="flex flex-col justify-center gap-px">
          <p className="text-primary/80 text-xs font-medium">{title}</p>
          <p className="text-primary/50 text-[10px]">{description}</p>
        </div>
      </div>
      <div className="text-primary/50 text-[12px]">{time}</div>
    </div>
  );
}
