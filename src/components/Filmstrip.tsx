import * as React from "react";
import { Photo } from "../types";
import { motion } from "motion/react";
import { fixImageUrl, getFilterString } from "../lib/imageProcessing";

interface FilmstripProps {
  photos: Photo[];
  selectedPhotoId: string | null;
  onSelect: (id: string) => void;
}

export function Filmstrip({ photos, selectedPhotoId, onSelect }: FilmstripProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to selected photo
  React.useEffect(() => {
    if (selectedPhotoId && scrollRef.current) {
      const activeElement = scrollRef.current.querySelector(`[data-id="${selectedPhotoId}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedPhotoId]);

  return (
    <div className="h-16 sm:h-24 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-xl flex items-center px-4 gap-3 overflow-x-auto custom-scrollbar no-scrollbar" ref={scrollRef}>
      {photos.map((photo) => (
        <motion.div
          key={photo.id}
          data-id={photo.id}
          whileHover={{ y: -4 }}
          onClick={() => onSelect(photo.id)}
          className={`relative shrink-0 w-20 h-12 sm:w-28 sm:h-16 rounded-md overflow-hidden cursor-pointer border-2 transition-all duration-300 ${
            selectedPhotoId === photo.id ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-zinc-800 opacity-60 hover:opacity-100'
          }`}
        >
          <img 
            src={fixImageUrl(photo.thumbnailUrl || photo.url)} 
            alt={photo.title}
            className="w-full h-full object-cover"
            style={{ filter: getFilterString(photo.settings) }}
            referrerPolicy="no-referrer"
          />
          {/* Color Balance Overlays for Filmstrip */}
          <div className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-60" style={{ backgroundColor: photo.settings.shadowTint }} />
          <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-50" style={{ backgroundColor: photo.settings.midtoneTint }} />
          <div className="absolute inset-0 pointer-events-none mix-blend-color opacity-40" style={{ backgroundColor: photo.settings.highlightTint }} />
          
          {selectedPhotoId === photo.id && (
            <div className="absolute inset-0 bg-amber-500/10 flex items-center justify-center">
              <div className="w-1 h-1 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
