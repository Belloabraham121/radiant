"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, Globe, Hammer, Rocket } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { PROJECTS } from "@/lib/app-data";
import { getAgent, fmt } from "@/lib/explorer-data";

gsap.registerPlugin(useGSAP);

export default function ProjectsPage() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-project-card]", {
        y: 32,
        opacity: 0,
        rotation: () => gsap.utils.random(-2.5, 2.5),
        duration: 0.6,
        stagger: 0.09,
        ease: "back.out(1.4)",
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-start gap-3">
        <SidebarToggle />
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            Your projects
          </h1>
          <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
            Everything your agent has built for you. It keeps all of these in its memory — new
            chats can reference, reuse, and extend any of them.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {PROJECTS.map((project) => {
          const agent = project.agentId ? getAgent(project.agentId) : undefined;
          return (
            <Link
              key={project.id}
              href={`/app/projects/${project.id}`}
              data-project-card
              className="group flex flex-col gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[9px_9px_0_var(--hero-ink)]"
            >
              <div className="flex items-start justify-between">
                <span
                  className="flex size-12 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-xl font-extrabold text-white"
                  style={{ backgroundColor: project.accent }}
                >
                  {project.name[0]}
                </span>
                <span className="flex items-center gap-2">
                  {project.status === "live" ? (
                    <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
                      <Globe className="size-3.5" strokeWidth={2.5} />
                      live
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-3 py-1 text-xs font-bold text-[#b97700]">
                      <Hammer className="size-3.5" strokeWidth={2.5} />
                      draft
                    </span>
                  )}
                  <ArrowUpRight className="size-5 text-[var(--hero-ink)]/30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--hero-ink)]" />
                </span>
              </div>

              <div>
                <h3 className="font-heading text-xl font-extrabold tracking-tight">
                  {project.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                  {project.tagline}
                </p>
              </div>

              <div className="flex items-center justify-between border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3 text-xs font-bold text-[var(--hero-ink)]/45">
                <span>built in “{project.builtIn}”</span>
                {agent ? (
                  <span style={{ color: project.accent }}>{fmt(agent.uses)} users</span>
                ) : (
                  <span className="flex items-center gap-1" style={{ color: project.accent }}>
                    <Rocket className="size-3.5" strokeWidth={2.5} />
                    ready to launch
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
