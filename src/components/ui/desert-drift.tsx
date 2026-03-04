import { cn } from "@/lib/utils";

interface DesertDriftProps {
  className?: string;
}

export const DesertDrift = ({ className }: DesertDriftProps) => {
  return (
    <div className={cn("absolute inset-0 -z-10 rounded-3xl overflow-hidden", className)}>
      <div className="absolute inset-0 opacity-50">
        <iframe 
          src="https://my.spline.design/untitled-k1KQe1bIq5W7lZvLark2ZzGe/" 
          className="w-full h-full pointer-events-none scale-110" 
          frameBorder="0" 
          allowFullScreen 
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#070910]/30 via-transparent to-[#070910]/60" />
    </div>
  );
};
