import React from "react";

const ChatThread = () => {
  return (
    <div className="flex w-full flex-col gap-7 px-8 py-8">
      <style>{`
        @keyframes ct-blink {
          0%, 70%, 100% { opacity: .35; transform: translateY(0); }
          35% { opacity: 1; transform: translateY(-3px); }
        }
        .ct-dot { animation: ct-blink 1.3s ease-in-out infinite; }
      `}</style>

      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Ethan Parker
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            9:41 AM
          </span>
        </div>
        <div className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-linear-to-b from-white to-neutral-100 px-4 py-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.03),inset_0_0_0_1px_rgba(0,0,0,0.07),0_5px_14px_-6px_rgba(0,0,0,0.08)] dark:from-[#262626] dark:to-[#1c1c1c] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.05),0_12px_22px_-10px_rgba(0,0,0,0.6)]">
          <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
            Hey! Can I switch to annual billing and keep my current rate?
          </p>
        </div>
      </div>

      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Madison Reed
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            9:43 AM
          </span>
        </div>
        <div className="w-fit rounded-2xl rounded-bl-sm bg-linear-to-b from-[#8b7bf7] to-[#6a56ec] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_18px_-6px_rgba(106,86,236,0.5)]">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/95">Working</span>
            <div className="flex gap-1">
              <span
                className="ct-dot size-1.5 rounded-full bg-white/90"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="ct-dot size-1.5 rounded-full bg-white/90"
                style={{ animationDelay: "160ms" }}
              />
              <span
                className="ct-dot size-1.5 rounded-full bg-white/90"
                style={{ animationDelay: "320ms" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatThread;
