"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  comingSoon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  comingSoon?: boolean;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className={cn(
        "row-span-1 rounded-xl group/bento hover:shadow-xl hover:shadow-amber-500/5 transition duration-200 shadow-sm dark:shadow-none p-4 bg-white dark:bg-blue-950/30 border-neutral-200 dark:border-blue-900/50 border justify-between flex flex-col space-y-4 relative",
        comingSoon && "opacity-70",
        className
      )}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded-full border border-purple-500/30">
          Coming Soon
        </span>
      )}
      {header}
      <div className="group-hover/bento:translate-x-2 transition duration-200">
        {icon}
        <div className="font-sans font-bold text-neutral-600 dark:text-slate-200 mb-2 mt-2">

          {title}
        </div>
        <div className="font-sans font-normal text-xs text-neutral-500 dark:text-slate-400">
          {description}
        </div>
      </div>
    </motion.div>
  );
};

