import React, { useRef, useState } from 'react';
import {
  Clock,
  ImagePlus,
  Lock,
  Send,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { ChannelMessage } from '../types/channel';

interface AdminPanelProps {
  scheduledMessages: ChannelMessage[];
  onSendNow: (text: string, imageData: string | null) => Promise<void>;
  onSchedule: (
    text: string,
    imageData: string | null,
    publishAt: number
  ) => Promise<void>;
  onPublishScheduledNow: (messageId: string) => Promise<void>;
  onDeleteScheduled: (messageId: string) => Promise<void>;
  onCloseAdmin: () => void;
  onNotify: (msg: string, variant?: 'success' | 'error') => void;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxWidth = 800;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image compression unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.75;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 420000 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 445000) {
          reject(new Error('Image is still too large after compression. Choose a smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function formatScheduledTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

export function AdminPanel({
  scheduledMessages,
  onSendNow,
  onSchedule,
  onPublishScheduledNow,
  onDeleteScheduled,
  onCloseAdmin,
  onNotify,
}: AdminPanelProps) {
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setText('');
    setImageData(null);
    setFileName(null);
    setScheduleTime('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setImageData(compressed);
      setFileName(file.name);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to process image.',
        'error'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendNow = async () => {
    const trimmed = text.trim();
    if (!trimmed && !imageData) {
      onNotify('Enter a message or attach an image first.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await onSendNow(trimmed, imageData);
      resetForm();
      onNotify('Video alert broadcast to channel.', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to send alert.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedule = async () => {
    const trimmed = text.trim();
    if (!trimmed && !imageData) {
      onNotify('Enter a message or attach an image first.', 'error');
      return;
    }
    if (!scheduleTime) {
      onNotify('Select a future date and time to schedule.', 'error');
      return;
    }
    const publishTimestamp = new Date(scheduleTime).getTime();
    if (Number.isNaN(publishTimestamp) || publishTimestamp <= Date.now()) {
      onNotify('Please pick a future date and time.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await onSchedule(trimmed, imageData, publishTimestamp);
      resetForm();
      onNotify('Video alert added to scheduled queue.', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to schedule alert.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Admin Control Panel"
      className="bg-white border-t border-stone-200 px-4 py-3.5 sm:px-6 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#008069]">
          <Shield className="w-4 h-4 shrink-0" />
          <span>Admin Control Panel</span>
          <span className="text-stone-400" aria-hidden="true">·</span>
          <span className="text-stone-500 font-normal font-mono-tabular">
            {text.length}/4000
          </span>
        </div>

        <button
          type="button"
          onClick={onCloseAdmin}
          className="text-xs font-medium text-stone-600 hover:text-red-600 inline-flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-stone-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Lock className="w-3.5 h-3.5" />
          Lock Admin
        </button>
      </div>

      {imageData && (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-stone-50 border border-stone-200">
          <img
            src={imageData}
            alt="Selected attachment preview"
            className="w-12 h-12 rounded-lg object-cover shrink-0 border border-stone-200"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-stone-800 truncate">
              {fileName || 'Attached image'}
            </div>
            <div className="text-[11px] text-stone-500">Compressed JPEG ready</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setImageData(null);
              setFileName(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            aria-label="Remove image"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 4000))}
        placeholder="Write video announcement or paste YouTube URL..."
        rows={3}
        className="w-full p-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:border-[#008069] focus:ring-2 focus:ring-[#008069]/15"
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-h-[40px] px-3 py-2 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200 text-xs font-medium text-stone-700 inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0">
            <ImagePlus className="w-4 h-4 text-stone-600" />
            <span className="max-w-[140px] truncate">
              {fileName ? fileName : 'Add Image'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageChange}
            />
          </label>

          <input
            type="datetime-local"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            aria-label="Schedule publish date and time"
            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700 font-mono-tabular focus:outline-none focus:border-[#008069]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSchedule}
            className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-lg bg-[#027eb5] hover:bg-[#026998] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Clock className="w-3.5 h-3.5" />
            Schedule
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSendNow}
            className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-lg bg-[#008069] hover:bg-[#006B58] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Send Now
          </button>
        </div>
      </div>

      {scheduledMessages.length > 0 && (
        <div className="pt-2 border-t border-stone-100">
          <div className="text-xs font-semibold text-stone-600 mb-2 flex items-center justify-between">
            <span>Scheduled Queue ({scheduledMessages.length})</span>
            <span className="font-normal text-stone-400">Hidden from subscribers until publish time</span>
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-xl bg-stone-50/70">
            {scheduledMessages.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono-tabular font-medium text-[#027eb5]">
                    {formatScheduledTime(item.publishAt)}
                  </div>
                  <div className="text-stone-700 truncate">
                    {item.text ? item.text : '[Image attachment]'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPublishScheduledNow(item.id)}
                    title="Publish immediately"
                    className="min-h-[32px] px-2.5 py-1 rounded-md bg-white hover:bg-[#d9fdd3] border border-stone-200 text-[#008069] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Zap className="w-3 h-3" />
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteScheduled(item.id)}
                    title="Cancel scheduled alert"
                    aria-label="Cancel scheduled alert"
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
