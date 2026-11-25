import { useState } from 'react';

interface ChannelAvatarProps {
  size?: 'sm' | 'lg';
  className?: string;
}

export function ChannelAvatar({ size = 'lg', className = '' }: ChannelAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const dims = size === 'sm' ? 'w-10 h-10 text-xs' : 'w-16 h-16 text-lg';

  if (imgFailed) {
    return (
      <div
        className={`${dims} rounded-full bg-[#008069] text-white font-display font-bold flex items-center justify-center shrink-0 border-2 border-white shadow-xs select-none ${className}`}
        aria-label="Janiru tech academy"
      >
        JTA
      </div>
    );
  }

  return (
    <img
      src="/assets/aistudio/chanel_profile_picture_a34f46ad.jpeg"
      alt="Janiru tech academy channel avatar"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${dims} rounded-full object-cover shrink-0 border-2 border-white shadow-xs bg-stone-100 ${className}`}
    />
  );
}
