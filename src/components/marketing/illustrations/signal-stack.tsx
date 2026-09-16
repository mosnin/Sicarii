"use client";

/**
 * Signals - Forge UI `notification-stack`, adapted.
 *
 * The whole GSAP timeline is the vendor's: the cursor travels, clicks, the
 * notification centre expands, three cards spring in, then "Send to pipeline"
 * clears them. Only the card data, the icons and the palette changed. The
 * component already accepts `notificationCardItems`, so the signals are passed
 * as data rather than patched in.
 *
 * Two Scalar-specific notes: the vendor leans on `text-primary` for body copy,
 * which in our system is baby blue and would paint every label - those are
 * routed back to the text tokens. And the reduced-motion branch sets the end
 * state instead of replaying a slower cursor demo.
 */

import gsap from "gsap";
import { cn } from "@/lib/utils";
import { useRef } from "react";

import { FitScale } from "./fit-scale";
import { useGSAP } from "@gsap/react";
import { Banknote, Cpu, MousePointer2, UserPlus } from "lucide-react";

type NotificationCardItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
};

const notificationItems: NotificationCardItem[] = [
  {
    id: "funding",
    icon: <Banknote className="size-5 text-primary" />,
    title: "Northwind Pay raised $40M",
    description: "Series B, budget just landed",
    time: "2h ago",
  },
  {
    id: "hiring",
    icon: <UserPlus className="size-5 text-primary" />,
    title: "Cedar Capital is hiring",
    description: "3 RevOps roles opened",
    time: "Today",
  },
  {
    id: "tech",
    icon: <Cpu className="size-5 text-primary" />,
    title: "Ledgerline changed stack",
    description: "Moved off their billing provider",
    time: "Yesterday",
  },
];

export function SignalStack({
  notificationCardItems = notificationItems,
}: {
  notificationCardItems?: NotificationCardItem[];
}) {
  const cursorRef = useRef(null);
  const notificationCenterRef = useRef(null);
  const readButtonRef = useRef(null);
  const notification1Ref = useRef(null);
  const notification2Ref = useRef(null);
  const notification3Ref = useRef(null);

  useGSAP(() => {
    // Reduced motion gets the end state, not a slower cursor demo.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set(
          [notification1Ref.current, notification2Ref.current, notification3Ref.current],
          { y: 0, opacity: 1, scale: 1 },
        );
        gsap.set(notificationCenterRef.current, { y: 70, width: 280 });
        gsap.set(cursorRef.current, { opacity: 0 });
        return;
      }
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
                "rounded-sm border border-border",
                "bg-background",
              )}
            >
              <div className="relative top-0 left-0 h-full w-70 rounded-sm">
                <div className="absolute top-0 left-2 flex h-full w-full items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-primary"></span>
                  <p className="text-foreground text-xs">3 new signals</p>
                </div>
                <div
                  ref={readButtonRef}
                  className={cn(
                    "absolute top-0.5 right-0.5",
                    "flex h-[90%] w-22.5 items-center justify-center",
                    "text-foreground rounded-sm px-1 text-[10px] opacity-0",
                    "bg-muted",
                  )}
                >
                  Send to pipeline
                </div>
              </div>
            </div>
          </div>
          <div
            ref={cursorRef}
            className="absolute top-4 right-7 flex items-center"
          >
            <span className="text-foreground">
              <MousePointer2 className="size-5" />
            </span>
          </div>
        </div>
      </div>
    </FitScale>
  );
};


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
        `absolute inset-x-0 mx-auto flex h-15 w-full max-w-72.5 scale-[0.5] items-center justify-between rounded-sm border border-border bg-background px-2 opacity-0 ${top}`,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/60">
          {icon}
        </span>
        <div className="flex flex-col justify-center gap-px">
          <p className="text-foreground text-xs font-medium">{title}</p>
          <p className="text-muted-foreground text-[10px]">{description}</p>
        </div>
      </div>
      <div className="text-muted-foreground text-[12px]">{time}</div>
    </div>
  );
}
