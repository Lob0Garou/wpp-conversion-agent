"use client";

import { useEffect, useState, RefObject } from "react";
import { animate } from "framer-motion";

interface CountdownTimerProps {
    targetDateIso: string; // ISO date indicating the SLA deadline or start time
    containerRef: RefObject<HTMLElement | null>;
    defaultSlaMinutes?: number; // Minutes until it's considered breached
    onExpire?: () => void;
}

export default function CountdownTimer({ targetDateIso, containerRef, defaultSlaMinutes = 10, onExpire }: CountdownTimerProps) {
    const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
        const start = new Date(targetDateIso).getTime();
        const target = start + defaultSlaMinutes * 60000;
        return target - Date.now();
    });

    const isBreached = timeLeftMs <= 0;

    useEffect(() => {
        const interval = setInterval(() => {
            const start = new Date(targetDateIso).getTime();
            const target = start + defaultSlaMinutes * 60000;
            const remaining = target - Date.now();
            setTimeLeftMs(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDateIso, defaultSlaMinutes]);

    // Imperative shake animation when it breaches
    useEffect(() => {
        let shakeInterval: NodeJS.Timeout;
        if (isBreached && containerRef.current) {
            onExpire?.();
            // Shake every 3 seconds if breached
            const shake = () => {
                animate(
                    containerRef.current!,
                    { x: [-4, 4, -4, 4, 0] },
                    { duration: 0.4, ease: "easeInOut" }
                );
            };

            shake(); // Initial shake
            shakeInterval = setInterval(shake, 3000);

            // Apply pulsing red border directly via class to avoid re-renders on parent
            containerRef.current.classList.add("ring-2", "ring-[#E3000F]", "ring-offset-2", "ring-offset-[#1a1d23]");
            containerRef.current.classList.add("animate-pulse");
        } else if (containerRef.current) {
            containerRef.current.classList.remove("ring-2", "ring-[#E3000F]", "ring-offset-2", "ring-offset-[#1a1d23]", "animate-pulse");
        }

        return () => {
            if (shakeInterval) clearInterval(shakeInterval);
        };
    }, [isBreached, containerRef]);

    const absMs = Math.abs(timeLeftMs);
    const minutes = Math.floor(absMs / 60000);
    const seconds = Math.floor((absMs % 60000) / 1000);

    const sign = timeLeftMs < 0 ? "-" : "";
    const formatted = `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    return (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1d23]/80 rounded text-[#E3000F] font-mono text-xs font-bold border border-[#E3000F]/30 backdrop-blur-sm z-20">
            {isBreached && <span className="material-symbols-rounded text-[14px]">warning</span>}
            {formatted}
        </div>
    );
}
