import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function Card({ children, className, onClick, hoverable }: CardProps) {
  const isInteractive = !!onClick || hoverable;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700",
        isInteractive && "cursor-pointer transition-shadow hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
        className
      )}
    >
      {children}
    </div>
  );
}
