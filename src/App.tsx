import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  BellRing,
  Check,
  Lock,
  LogIn,
  LogOut,
  Radio,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import type {
  ChannelMessage,
  ChannelMeta,
  FeedFilter,
  ReactionType,
  UserReactionsMap,
} from './types/channel';
import { ChannelAvatar } from './components/ChannelAvatar';
import { MessageCard } from './components/MessageCard';
import { AdminModal } from './components/AdminModal';
import { AdminPanel } from './components/AdminPanel';
import { LightboxModal } from './components/LightboxModal';

const DEFAULT_META: ChannelMeta = {
  name: 'Janiru tech academy',
  subtitle: 'Video Alerts',
  baseFollowers: 1240,
  followersCount: 0,
};

function formatDateDivider(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  if (timestamp >= todayStart) return 'Today';
  if (timestamp >= yesterdayStart) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isExtraAdmin, setIsExtraAdmin] = useState(false);

  const [channelMeta, setChannelMeta] = useState<ChannelMeta>(DEFAULT_META);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [userReactions, setUserReactions] = useState<UserReactionsMap>({});
  const [reactingMap, setReactingMap] = useState<Record<string, ReactionType | null>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [queryCutoff, setQueryCutoff] = useState(() => Date.now() - 2000);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const showToast = useCallback(
    (text: string, variant: 'success' | 'error' = 'success') => {
      setToast({ text, variant });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser && nextUser.emailVerified && nextUser.email !== BOOTSTRAPPED_ADMIN_EMAIL) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', nextUser.uid));
          setIsExtraAdmin(adminSnap.exists());
        } catch {
          setIsExtraAdmin(false);
        }
      } else {
        setIsExtraAdmin(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isBootstrappedAdmin = Boolean(
    user && user.emailVerified && user.email === BOOTSTRAPPED_ADMIN_EMAIL
  );
  const isAuthorizedAdminAccount = isBootstrappedAdmin || isExtraAdmin;

  // Lock admin panel if user signs out or switches to a non-admin account
  useEffect(() => {
    if (!isAuthorizedAdminAccount && adminUnlocked) {
      setAdminUnlocked(false);
    }
  }, [isAuthorizedAdminAccount, adminUnlocked]);

  // Periodic scheduler clock tick (5s) + subscriber query cutoff refresh (10s)
  useEffect(() => {
    const tickTimer = setInterval(() => {
      setNowTick(Date.now());
    }, 5000);

    const queryTimer = setInterval(() => {
      setQueryCutoff(Date.now() - 2000);
    }, 10000);

    return () => {
      clearInterval(tickTimer);
      clearInterval(queryTimer);
    };
  }, []);

  // Listen to /channel/meta
  useEffect(() => {
    const metaRef = doc(db, 'channel', 'meta');
    const unsub = onSnapshot(
      metaRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setChannelMeta({
            name: typeof data.name === 'string' ? data.name : DEFAULT_META.name,
            subtitle: typeof data.subtitle === 'string' ? data.subtitle : DEFAULT_META.subtitle,
            baseFollowers:
              typeof data.baseFollowers === 'number'
                ? data.baseFollowers
                : DEFAULT_META.baseFollowers,
            followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
          });
        } else {
          setChannelMeta(DEFAULT_META);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'channel/meta');
      }
    );
    return () => unsub();
  }, []);

  // Listen to current user's follower record
  useEffect(() => {
    if (!user) {
      setIsFollowing(localStorage.getItem('channel_followed_guest') === 'true');
      return;
    }
    const path = `channel/meta/followers/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'channel', 'meta', 'followers', user.uid),
      (snap) => {
        setIsFollowing(snap.exists());
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [user]);

  // Listen to /messages in real time
  useEffect(() => {
    if (!authReady) return;
    setLoadingFeed(true);

    const messagesCol = collection(db, 'messages');
    const messagesQuery = isBootstrappedAdmin
      ? query(messagesCol, orderBy('publishAt', 'asc'))
      : query(
          messagesCol,
          where('publishAt', '<=', queryCutoff),
          orderBy('publishAt', 'asc')
        );

    const unsub = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const list: ChannelMessage[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            text: typeof data.text === 'string' ? data.text : '',
            imageData: typeof data.imageData === 'string' ? data.imageData : null,
            publishAt: typeof data.publishAt === 'number' ? data.publishAt : Date.now(),
            authorId: typeof data.authorId === 'string' ? data.authorId : '',
            likesCount: typeof data.likesCount === 'number' ? data.likesCount : 0,
            heartsCount: typeof data.heartsCount === 'number' ? data.heartsCount : 0,
          };
        });

        setMessages(list);
        setLoadingFeed(false);

        // Notify follower when a genuinely new published message arrives
        const now = Date.now();
        if (!initialLoadDoneRef.current) {
          list.forEach((m) => seenIdsRef.current.add(m.id));
          initialLoadDoneRef.current = true;
        } else {
          list.forEach((m) => {
            if (!seenIdsRef.current.has(m.id) && m.publishAt <= now) {
              seenIdsRef.current.add(m.id);
              if (
                isFollowing &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted'
              ) {
                new Notification('Janiru tech academy - Video Alerts', {
                  body: m.text ? m.text.slice(0, 120) : 'New video alert posted',
                  icon: '/assets/aistudio/chanel_profile_picture_a34f46ad.jpeg',
                });
              }
            }
          });
        }
      },
      (error) => {
        setLoadingFeed(false);
        handleFirestoreError(error, OperationType.LIST, 'messages');
      }
    );

    return () => unsub();
  }, [authReady, isBootstrappedAdmin, queryCutoff, isFollowing]);

  // Hydrate per-message reactions for signed-in user (no composite index needed)
  useEffect(() => {
    if (!user || messages.length === 0) {
      if (!user) setUserReactions({});
      return;
    }

    let cancelled = false;
    const publishedIds = messages.filter((m) => m.publishAt <= nowTick).map((m) => m.id);
    if (publishedIds.length === 0) return;

    const loadReactions = async () => {
      const nextMap: UserReactionsMap = {};
      await Promise.all(
        publishedIds.map(async (msgId) => {
          try {
            const [likeSnap, heartSnap] = await Promise.all([
              getDoc(doc(db, 'messages', msgId, 'reactions', `${user.uid}_likes`)),
              getDoc(doc(db, 'messages', msgId, 'reactions', `${user.uid}_hearts`)),
            ]);
            nextMap[msgId] = {
              likes: likeSnap.exists(),
              hearts: heartSnap.exists(),
            };
          } catch {
            nextMap[msgId] = { likes: false, hearts: false };
          }
        })
      );
      if (!cancelled) {
        setUserReactions(nextMap);
      }
    };

    void loadReactions();
    return () => {
      cancelled = true;
    };
  }, [user, messages, nowTick]);

  // Triple-click secret trigger on Channel Logo/Title
  const handleSecretTriggerClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 600);

    if (clickCountRef.current === 3) {
      clickCountRef.current = 0;
      if (!adminUnlocked) {
        setAdminModalOpen(true);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    setAdminUnlocked(false);
    await signOut(auth);
    showToast('Signed out.', 'success');
  };

  const handleToggleFollow = async () => {
    if (followBusy) return;
    setFollowBusy(true);

    try {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const res = await signInWithPopup(auth, googleProvider);
        activeUser = res.user;
      }

      if (!activeUser.emailVerified) {
        showToast('Please use a verified Google account to follow.', 'error');
        return;
      }

      const metaRef = doc(db, 'channel', 'meta');
      const followerRef = doc(db, 'channel', 'meta', 'followers', activeUser.uid);
      const [metaSnap, followerSnap] = await Promise.all([
        getDoc(metaRef),
        getDoc(followerRef),
      ]);

      const batch = writeBatch(db);
      if (followerSnap.exists()) {
        batch.delete(followerRef);
        batch.update(metaRef, {
          followersCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        localStorage.removeItem('channel_followed_guest');
        showToast('Unfollowed channel.', 'success');
      } else {
        if (!metaSnap.exists()) {
          batch.set(metaRef, {
            name: DEFAULT_META.name,
            subtitle: DEFAULT_META.subtitle,
            baseFollowers: DEFAULT_META.baseFollowers,
            followersCount: 1,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.update(metaRef, {
            followersCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
        batch.set(followerRef, {
          userId: activeUser.uid,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        localStorage.setItem('channel_followed_guest', 'true');
        showToast('Following Janiru tech academy!', 'success');

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('popup-closed-by-user')) {
        showToast('Sign-in cancelled.', 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'channel/meta');
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const handleReact = async (messageId: string, type: ReactionType) => {
    if (reactingMap[messageId]) return;
    setReactingMap((prev) => ({ ...prev, [messageId]: type }));

    try {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        const res = await signInWithPopup(auth, googleProvider);
        activeUser = res.user;
      }

      if (!activeUser.emailVerified) {
        showToast('Please use a verified Google account to react.', 'error');
        return;
      }

      const msgRef = doc(db, 'messages', messageId);
      const reactionRef = doc(
        db,
        'messages',
        messageId,
        'reactions',
        `${activeUser.uid}_${type}`
      );
      const existingSnap = await getDoc(reactionRef);
      const countField = type === 'likes' ? 'likesCount' : 'heartsCount';

      const batch = writeBatch(db);
      if (existingSnap.exists()) {
        batch.delete(reactionRef);
        batch.update(msgRef, {
          [countField]: increment(-1),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        setUserReactions((prev) => ({
          ...prev,
          [messageId]: {
            likes: prev[messageId]?.likes ?? false,
            hearts: prev[messageId]?.hearts ?? false,
            [type]: false,
          },
        }));
      } else {
        batch.set(reactionRef, {
          userId: activeUser.uid,
          type,
          createdAt: serverTimestamp(),
        });
        batch.update(msgRef, {
          [countField]: increment(1),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        setUserReactions((prev) => ({
          ...prev,
          [messageId]: {
            likes: prev[messageId]?.likes ?? false,
            hearts: prev[messageId]?.hearts ?? false,
            [type]: true,
          },
        }));
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('popup-closed-by-user')) {
        showToast('Sign-in cancelled.', 'error');
      } else {
        handleFirestoreError(err, OperationType.UPDATE, `messages/${messageId}`);
      }
    } finally {
      setReactingMap((prev) => ({ ...prev, [messageId]: null }));
    }
  };

  const handleSendNow = async (text: string, imageData: string | null) => {
    const activeUser = auth.currentUser;
    if (!activeUser) throw new Error('Admin sign-in required.');

    const newMsgRef = doc(collection(db, 'messages'));
    try {
      await setDoc(newMsgRef, {
        text,
        ...(imageData ? { imageData } : {}),
        publishAt: Date.now() - 2000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        authorId: activeUser.uid,
        likesCount: 0,
        heartsCount: 0,
      });
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `messages/${newMsgRef.id}`);
    }
  };

  const handleSchedule = async (
    text: string,
    imageData: string | null,
    publishAt: number
  ) => {
    const activeUser = auth.currentUser;
    if (!activeUser) throw new Error('Admin sign-in required.');

    const newMsgRef = doc(collection(db, 'messages'));
    try {
      await setDoc(newMsgRef, {
        text,
        ...(imageData ? { imageData } : {}),
        publishAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        authorId: activeUser.uid,
        likesCount: 0,
        heartsCount: 0,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `messages/${newMsgRef.id}`);
    }
  };

  const handlePublishScheduledNow = async (messageId: string) => {
    try {
      await updateDoc(doc(db, 'messages', messageId), {
        publishAt: Date.now() - 2000,
        updatedAt: serverTimestamp(),
      });
      showToast('Scheduled alert published now.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `messages/${messageId}`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteDoc(doc(db, 'messages', messageId));
      showToast('Alert deleted.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `messages/${messageId}`);
    }
  };

  const publishedMessages = useMemo(
    () => messages.filter((m) => m.publishAt <= nowTick),
    [messages, nowTick]
  );

  const scheduledMessages = useMemo(
    () => messages.filter((m) => m.publishAt > nowTick),
    [messages, nowTick]
  );

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publishedMessages.filter((m) => {
      if (feedFilter === 'media' && !m.imageData) return false;
      if (feedFilter === 'links' && !/https?:\/\//i.test(m.text)) return false;
      if (q && !m.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [publishedMessages, feedFilter, searchQuery]);

  // Group filtered messages by date label
  const groupedFeed = useMemo(() => {
    const groups: { label: string; items: ChannelMessage[] }[] = [];
    for (const msg of filteredMessages) {
      const label = formatDateDivider(msg.publishAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.items.push(msg);
      } else {
        groups.push({ label, items: [msg] });
      }
    }
    return groups;
  }, [filteredMessages]);

  const totalFollowers = channelMeta.baseFollowers + channelMeta.followersCount;

  return (
    <div className="min-h-screen lg:h-screen bg-[#F4F5F3] text-stone-900 flex flex-col">
      {/* Main Responsive Shell */}
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col lg:flex-row lg:gap-5 lg:p-5 min-h-0">
        {/* Desktop Left Rail: Channel Profile, Filters & Account */}
        <aside className="hidden lg:flex lg:w-[340px] shrink-0 bg-white border border-stone-200 rounded-2xl p-6 flex-col justify-between">
          <div className="space-y-6">
            {/* Triple-click secret trigger */}
            <div
              onClick={handleSecretTriggerClick}
              title="Channel Info"
              className="flex flex-col items-start gap-4 cursor-pointer select-none"
            >
              <div className="flex items-center gap-3.5">
                <ChannelAvatar size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-display text-lg font-bold text-stone-900 leading-tight">
                      {channelMeta.name}
                    </h1>
                    <BadgeCheck
                      className="w-5 h-5 text-[#008069] shrink-0"
                      aria-label="Verified channel"
                    />
                  </div>
                  <p className="text-sm text-stone-500 mt-0.5">{channelMeta.subtitle}</p>
                </div>
              </div>
            </div>

            {/* Clean unboxed channel metrics */}
            <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono-tabular text-xl font-semibold text-stone-900">
                  {totalFollowers.toLocaleString()}
                </div>
                <div className="text-xs text-stone-500">Followers · Public Channel</div>
              </div>

              <button
                type="button"
                disabled={followBusy}
                onClick={handleToggleFollow}
                className={`min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#008069] ${
                  isFollowing
                    ? 'bg-[#d9fdd3] hover:bg-[#c5f7bc] text-[#006B58] border border-[#008069]/25'
                    : 'bg-[#008069] hover:bg-[#006B58] text-white'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="w-4 h-4" />
                    Following
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    Follow
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-stone-600 leading-relaxed">
              Instant notifications for new tutorials, tech breakdowns, live stream announcements, and curated video uploads.
            </p>

            {/* Search & Filters */}
            <div className="space-y-3 pt-2 border-t border-stone-100">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search video alerts..."
                  aria-label="Search video alerts"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:border-[#008069]"
                />
              </div>

              <div
                className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-lg"
                role="tablist"
                aria-label="Filter channel updates"
              >
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'media', label: 'Images' },
                    { key: 'links', label: 'Videos' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={feedFilter === tab.key}
                    onClick={() => setFeedFilter(tab.key)}
                    className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      feedFilter === tab.key
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Account Footer */}
          <div className="pt-4 border-t border-stone-100 space-y-2.5">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-stone-900 truncate">
                    {user.displayName || 'Subscriber'}
                  </div>
                  <div className="text-[11px] text-stone-500 truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-medium text-stone-700 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in with Google to react &amp; follow
              </button>
            )}
          </div>
        </aside>

        {/* Mobile Sticky Compact Header (< 15% height) */}
        <header className="lg:hidden sticky top-0 z-30 bg-[#008069] text-white shadow-xs">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div
              onClick={handleSecretTriggerClick}
              title="Channel Info"
              className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none"
            >
              <ChannelAvatar size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <h1 className="font-display text-sm font-bold truncate">
                    {channelMeta.name}
                  </h1>
                  <BadgeCheck className="w-4 h-4 text-[#d9fdd3] shrink-0" />
                </div>
                <p className="text-[11px] text-[#d9fdd3] font-mono-tabular truncate">
                  {totalFollowers.toLocaleString()} followers · {channelMeta.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileToolsOpen((prev) => !prev)}
                aria-label="Toggle search and filters"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-white/90 hover:bg-white/10 transition-colors cursor-pointer"
              >
                {mobileToolsOpen ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
              </button>

              <button
                type="button"
                disabled={followBusy}
                onClick={handleToggleFollow}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isFollowing
                    ? 'bg-transparent border border-white text-white'
                    : 'bg-white text-[#008069]'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Following
                  </>
                ) : (
                  'Follow'
                )}
              </button>
            </div>
          </div>

          {mobileToolsOpen && (
            <div className="px-3.5 pb-3 pt-1 bg-[#006B58] space-y-2 border-t border-white/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-white/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search alerts..."
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/15 text-xs text-white placeholder:text-white/65 focus:outline-none focus:bg-white/20"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['all', 'media', 'links'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFeedFilter(key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer ${
                        feedFilter === key
                          ? 'bg-white text-[#006B58]'
                          : 'text-white/85 hover:bg-white/10'
                      }`}
                    >
                      {key === 'media' ? 'Images' : key === 'links' ? 'Videos' : 'All'}
                    </button>
                  ))}
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-[11px] text-white/90 underline cursor-pointer"
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn()}
                    className="text-[11px] text-white font-medium underline cursor-pointer"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Main Broadcast Feed Container */}
        <main className="flex-1 flex flex-col bg-white lg:border lg:border-stone-200 lg:rounded-2xl overflow-hidden min-h-0">
          {/* Desktop Feed Top Bar */}
          <div className="hidden lg:flex items-center justify-between px-6 py-3.5 border-b border-stone-200 bg-white">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Radio className="w-4 h-4 text-[#008069]" />
              <span>Channel Broadcast Feed</span>
            </div>
            <div className="text-xs text-stone-500 font-mono-tabular">
              {publishedMessages.length} {publishedMessages.length === 1 ? 'alert' : 'alerts'}
              {adminUnlocked && scheduledMessages.length > 0
                ? ` · ${scheduledMessages.length} scheduled`
                : ''}
            </div>
          </div>

          {/* Scrollable Message Timeline */}
          <div className="flex-1 overflow-y-auto channel-canvas-bg px-3.5 py-5 sm:px-6 space-y-4">
            {loadingFeed ? (
              <div className="space-y-4 max-w-[680px]">
                <div className="bg-white/90 rounded-2xl p-4 border border-stone-200/70 animate-pulse space-y-3">
                  <div className="h-4 bg-stone-200 rounded w-3/4" />
                  <div className="h-4 bg-stone-200 rounded w-1/2" />
                  <div className="h-7 bg-stone-100 rounded w-28" />
                </div>
                <div className="bg-white/90 rounded-2xl p-4 border border-stone-200/70 animate-pulse space-y-3">
                  <div className="h-40 bg-stone-200 rounded-xl w-full" />
                  <div className="h-4 bg-stone-200 rounded w-2/3" />
                </div>
              </div>
            ) : groupedFeed.length === 0 ? (
              <div className="h-full min-h-[260px] flex items-center justify-center">
                <div className="bg-white/95 border border-stone-200 rounded-2xl p-6 max-w-sm text-center shadow-xs space-y-2.5">
                  <div className="w-11 h-11 rounded-full bg-[#008069]/10 text-[#008069] flex items-center justify-center mx-auto">
                    <BellRing className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-base font-bold text-stone-900">
                    {searchQuery || feedFilter !== 'all'
                      ? 'No matching video alerts'
                      : 'No video alerts yet'}
                  </h2>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {searchQuery || feedFilter !== 'all'
                      ? 'Try clearing your search or switching back to All updates.'
                      : 'New video uploads and announcements from Janiru tech academy will appear here in real time.'}
                  </p>
                  {(searchQuery || feedFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFeedFilter('all');
                      }}
                      className="mt-1 px-4 py-2 rounded-lg bg-[#008069] text-white text-xs font-medium cursor-pointer"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              groupedFeed.map((group) => (
                <div key={group.label} className="space-y-3">
                  <div className="flex justify-center my-1">
                    <span className="bg-white/90 border border-stone-200/80 text-stone-600 text-[11px] font-medium px-3 py-1 rounded-lg shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
                      {group.label}
                    </span>
                  </div>
                  {group.items.map((msg) => (
                    <MessageCard
                      key={msg.id}
                      message={msg}
                      isAdmin={adminUnlocked && isAuthorizedAdminAccount}
                      userReacted={
                        userReactions[msg.id] || { likes: false, hearts: false }
                      }
                      reactingType={reactingMap[msg.id] || null}
                      onReact={handleReact}
                      onDelete={handleDeleteMessage}
                      onImageClick={(src) => setLightboxSrc(src)}
                    />
                  ))}
                </div>
              ))
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Footer: Read-only Notice OR Unlocked Admin Panel */}
          {adminUnlocked && isAuthorizedAdminAccount ? (
            <AdminPanel
              scheduledMessages={scheduledMessages}
              onSendNow={handleSendNow}
              onSchedule={handleSchedule}
              onPublishScheduledNow={handlePublishScheduledNow}
              onDeleteScheduled={handleDeleteMessage}
              onCloseAdmin={() => setAdminUnlocked(false)}
              onNotify={showToast}
            />
          ) : (
            <footer className="bg-[#F7F8F6] border-t border-stone-200 px-4 py-3.5 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span>Only admins can send messages in this channel.</span>
            </footer>
          )}
        </main>
      </div>

      {/* Inline Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg border transition-all ${
            toast.variant === 'error'
              ? 'bg-red-600 text-white border-red-700'
              : 'bg-stone-900 text-white border-stone-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Secret Triple-Click Admin Modal */}
      <AdminModal
        open={adminModalOpen}
        user={user}
        isAuthorizedAdminAccount={isAuthorizedAdminAccount}
        onClose={() => setAdminModalOpen(false)}
        onGoogleSignIn={handleGoogleSignIn}
        onUnlockSuccess={() => {
          setAdminModalOpen(false);
          setAdminUnlocked(true);
          showToast('Admin controls unlocked.', 'success');
        }}
      />

      {/* Full-size Image Lightbox */}
      <LightboxModal src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
