import React, { useState } from 'react';
import { ExternalLink, Heart, Play, ThumbsUp, Trash2, Check, X } from 'lucide-react';
import type { ChannelMessage, ReactionType } from '../types/channel';

interface MessageCardProps {
  message: ChannelMessage;
  isAdmin: boolean;
  userReacted: { likes: boolean; hearts: boolean };
  reactingType: ReactionType | null;
  onReact: (messageId: string, type: ReactionType) => void;
  onDelete: (messageId: string) => void;
  onImageClick: (src: string) => void;
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim();
      return id || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      if (parsed.pathname.startsWith('/live/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      return parsed.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  return text.match(regex) || [];
}

function renderLinkifiedText(text: string): React.ReactNode[] {
  const regex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (part.match(/^https?:\/\//)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#027eb5] hover:text-[#015f8a] underline underline-offset-2 break-all transition-colors"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function formatMessageTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageCard({
  message,
  isAdmin,
  userReacted,
  reactingType,
  onReact,
  onDelete,
  onImageClick,
}: MessageCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const urls = extractUrls(message.text || '');
  const firstVideoUrl = urls.find((u) => extractYouTubeId(u) !== null) || null;
  const youtubeId = firstVideoUrl ? extractYouTubeId(firstVideoUrl) : null;

  return (
    <article className="bg-white border border-stone-200/90 rounded-2xl rounded-tl-xs p-3 sm:p-4 max-w-[680px] w-full shadow-[0_1px_2px_rgba(17,27,33,0.06)] transition-colors">
      {message.imageData && (
        <button
          type="button"
          onClick={() => onImageClick(message.imageData!)}
          className="block w-full mb-2.5 rounded-xl overflow-hidden bg-stone-100 border border-stone-100 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#008069]"
        >
          <img
            src={message.imageData}
            alt="Video alert attachment"
            referrerPolicy="no-referrer"
            className="w-full max-h-[340px] object-cover block"
          />
        </button>
      )}

      {message.text && (
        <div className="text-[15px] leading-[1.55] text-[#111b21] whitespace-pre-wrap break-words px-0.5">
          {renderLinkifiedText(message.text)}
        </div>
      )}

      {firstVideoUrl && youtubeId && (
        <a
          href={firstVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F4F6F4] hover:bg-[#EAEFEA] border border-stone-200/80 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#008069] text-white flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-stone-900 truncate">
                Watch Video Alert on YouTube
              </div>
              <div className="text-xs text-stone-500 truncate font-mono-tabular">
                youtu.be/{youtubeId}
              </div>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-stone-500 group-hover:text-[#008069] shrink-0 transition-colors" />
        </a>
      )}

      <footer className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={reactingType === 'likes'}
            onClick={() => onReact(message.id, 'likes')}
            aria-pressed={userReacted.likes}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#008069] ${
              userReacted.likes
                ? 'bg-[#d9fdd3] text-[#006B58] border border-[#008069]/30'
                : 'bg-[#f4f5f3] hover:bg-stone-200/70 text-stone-700 border border-transparent'
            }`}
          >
            <ThumbsUp className={`w-3.5 h-3.5 ${userReacted.likes ? 'fill-current' : ''}`} />
            <span className="font-mono-tabular">{message.likesCount || 0}</span>
          </button>

          <button
            type="button"
            disabled={reactingType === 'hearts'}
            onClick={() => onReact(message.id, 'hearts')}
            aria-pressed={userReacted.hearts}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#008069] ${
              userReacted.hearts
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-[#f4f5f3] hover:bg-stone-200/70 text-stone-700 border border-transparent'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${userReacted.hearts ? 'fill-current text-rose-600' : ''}`} />
            <span className="font-mono-tabular">{message.heartsCount || 0}</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 ml-auto">
          <time
            dateTime={new Date(message.publishAt).toISOString()}
            className="text-xs text-stone-500 font-mono-tabular whitespace-nowrap"
          >
            {formatMessageTime(message.publishAt)}
          </time>

          {isAdmin && !confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="Delete alert"
              aria-label="Delete alert"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {isAdmin && confirmingDelete && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDelete(message.id);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-[32px] px-2 py-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium inline-flex items-center cursor-pointer"
                aria-label="Cancel delete"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}
