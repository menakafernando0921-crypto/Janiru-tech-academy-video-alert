export type ReactionType = 'likes' | 'hearts';

export type FeedFilter = 'all' | 'media' | 'links';

export interface ChannelMessage {
  id: string;
  text: string;
  imageData?: string | null;
  publishAt: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  authorId: string;
  likesCount: number;
  heartsCount: number;
}

export interface ChannelMeta {
  name: string;
  subtitle: string;
  baseFollowers: number;
  followersCount: number;
  updatedAt?: unknown;
}

export interface UserReactionsMap {
  [messageId: string]: {
    likes: boolean;
    hearts: boolean;
  };
}
