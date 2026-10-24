'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@moonwitness/client';
import {
  AttachmentIcon,
  SendIcon,
  SignalIcon,
  SignalOffIcon,
  SmartphoneIcon,
  UsersIcon,
} from '@moonwitness/ui/icons';
import { toast } from '@moonwitness/ui/components/toast';
import { Button } from '@moonwitness/ui/components/button';
import { Checkbox } from '@moonwitness/ui/components/checkbox';
import { Input } from '@moonwitness/ui/components/input';
import { Skeleton } from '@moonwitness/ui/components/skeleton';
import { Textarea } from '@moonwitness/ui/components/textarea';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { client } from '@/lib/client';
import { scopedQueryKey } from '@/lib/query-scope';
import { formatDateTime } from '@/lib/date-format';
import { MAX_ATTACHMENT_BYTES } from '@moonwitness/types';

type Account = {
  id?: number;
  status: string;
  phone_number?: string | null;
  qr_code?: string | null;
  last_error?: string | null;
  permissions?: {
    manage: boolean;
    manageConversations: boolean;
    createConversation: boolean;
    send: boolean;
  };
};
type Conversation = {
  id: number;
  jid: string;
  name: string;
  is_group: boolean;
  is_archived: boolean;
  is_pinned: boolean;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
};
type ConversationPage = {
  items: Conversation[];
  nextOffset: number;
  hasMore: boolean;
};

function formatConversationAddress(conversation: Conversation): string {
  const [localPart, domain] = conversation.jid.split('@');
  const identifier = localPart?.split(':')[0]?.trim();
  if (!identifier) return conversation.jid;

  if (conversation.is_group || domain === 'g.us') return `Group ID: ${identifier}`;
  if (domain === 's.whatsapp.net' && /^\d+$/.test(identifier)) return `+${identifier}`;
  if (domain === 'lid') return `WhatsApp ID: ${identifier}`;
  return conversation.jid;
}
type Message = {
  id: number;
  direction: string;
  is_last_read?: boolean;
  is_unread?: boolean;
  content?: string | null;
  status: string;
  retryable?: boolean;
  last_error?: string | null;
  message_type: string;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  sender_jid?: string | null;
  reply_to?: {
    id?: number;
    direction?: string;
    content?: string | null;
    message_type?: string;
    media_file_name?: string | null;
    unavailable?: boolean;
  } | null;
  is_forwarded?: boolean;
  create_date: string;
};
type ConversationFilter = 'all' | 'unread' | 'private' | 'groups';
type WhatsAppInboxPreferences = {
  selectedConversationId: number | null;
  conversationFilter: ConversationFilter;
  showArchived: boolean;
  sendOnEnter: boolean;
};
const defaultInboxPreferences: WhatsAppInboxPreferences = {
  selectedConversationId: null,
  conversationFilter: 'all',
  showArchived: false,
  sendOnEnter: true,
};
const statusLabel: Record<string, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  qr: 'Scan the QR code',
  qr_expired: 'QR code expired',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection error',
};
const messageStatusLabel: Record<string, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  received: 'Received',
  failed: 'Failed',
  unknown: 'Status unknown',
};

export function WhatsappPage() {
  const inboxPreferenceScope = `mw-whatsapp-inbox:${client.currentUser?.id ?? 'anonymous'}:${client.getCompanyId() ?? 'none'}`;
  return <WhatsappInbox key={inboxPreferenceScope} inboxPreferenceScope={inboxPreferenceScope} />;
}

function WhatsappInbox({ inboxPreferenceScope }: { inboxPreferenceScope: string }) {
  const queryClient = useQueryClient();
  const [inboxPreferences, setInboxPreferences] = useState(() =>
    readWhatsAppInboxPreferences(inboxPreferenceScope)
  );
  const { selectedConversationId: selected, conversationFilter, showArchived } = inboxPreferences;
  const setSelected = (selectedConversationId: number | null) =>
    {
      setReplyingTo(null);
      setInboxPreferences((current) => ({ ...current, selectedConversationId }));
    };
  const setConversationFilter = (conversationFilter: ConversationFilter) =>
    setInboxPreferences((current) => ({ ...current, conversationFilter }));
  const setShowArchived = (showArchived: boolean) =>
    setInboxPreferences((current) => ({ ...current, showArchived }));
  const [newPhone, setNewPhone] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [debouncedConversationSearch, setDebouncedConversationSearch] = useState('');
  const [updatingConversation, setUpdatingConversation] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardConversationSearch, setForwardConversationSearch] = useState('');
  const [debouncedForwardConversationSearch, setDebouncedForwardConversationSearch] = useState('');
  const [forwardShowArchived, setForwardShowArchived] = useState(false);
  const [loadingMoreForwardDestinations, setLoadingMoreForwardDestinations] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const forwardIdempotencyKey = useRef<{
    sourceId: number;
    destinationId: number;
    key: string;
  } | null>(null);
  const loadingMoreConversationsRef = useRef(false);
  const [olderPage, setOlderPage] = useState<{
    conversationId: number;
    messages: Message[];
    nextOffset: number;
    hasMore: boolean;
  } | null>(null);
  const [loadingOlderConversationId, setLoadingOlderConversationId] = useState<number | null>(null);
  const loadingOlderRef = useRef<number | null>(null);
  const activeConversationIdRef = useRef<number | undefined>(undefined);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<{ conversationId: number | undefined; messageId: number | undefined }>({
    conversationId: undefined,
    messageId: undefined,
  });
  const isNearLatestRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [qr, setQr] = useState<{ code: string; image: string } | null>(null);
  useEffect(() => {
    try {
      window.localStorage.setItem(inboxPreferenceScope, JSON.stringify(inboxPreferences));
    } catch {
      // The inbox remains usable when browser storage is unavailable.
    }
  }, [inboxPreferenceScope, inboxPreferences]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedConversationSearch(conversationSearch.trim()),
      250
    );
    return () => window.clearTimeout(timer);
  }, [conversationSearch]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedForwardConversationSearch(forwardConversationSearch.trim()),
      250
    );
    return () => window.clearTimeout(timer);
  }, [forwardConversationSearch]);
  const accountQuery = useQuery({
    queryKey: scopedQueryKey(['whatsapp', 'account']),
    queryFn: async () => (await client.request<{ data: Account }>('/whatsapp/account')).data,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
  const conversationsQueryKey = scopedQueryKey([
    'whatsapp',
    'conversations',
    debouncedConversationSearch,
    showArchived,
    conversationFilter,
  ]);
  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey,
    queryFn: async () => {
      const page = (
        await client.request<{ data: Conversation[] }>(
          `/whatsapp/conversations?limit=50&offset=0&archived=${showArchived}&unread=${conversationFilter === 'unread'}${debouncedConversationSearch ? `&search=${encodeURIComponent(debouncedConversationSearch)}` : ''}`
        )
      ).data;
      const cached = queryClient.getQueryData<ConversationPage>(conversationsQueryKey);
      const pageIds = new Set(page.map((conversation) => conversation.id));
      const cachedItems =
        cached?.items.filter(
          (item) =>
            item.is_archived === showArchived &&
            (conversationFilter !== 'unread' || item.unread_count > 0) &&
            !pageIds.has(item.id)
        ) ?? [];
      const items = [...page, ...cachedItems];
      return {
        items,
        nextOffset: Math.max(cached?.nextOffset ?? 0, items.length),
        hasMore: cached?.hasMore ?? page.length === 50,
      } satisfies ConversationPage;
    },
    enabled: accountQuery.data?.status === 'connected',
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const forwardDestinationsQueryKey = scopedQueryKey([
    'whatsapp',
    'forward-destinations',
    debouncedForwardConversationSearch,
    forwardShowArchived,
  ]);
  const forwardDestinationsQuery = useQuery({
    queryKey: forwardDestinationsQueryKey,
    queryFn: async () => {
      const page = (
        await client.request<{ data: Conversation[] }>(
          `/whatsapp/conversations?limit=50&offset=0&archived=${forwardShowArchived}&unread=false${debouncedForwardConversationSearch ? `&search=${encodeURIComponent(debouncedForwardConversationSearch)}` : ''}`
        )
      ).data;
      return { items: page, nextOffset: page.length, hasMore: page.length === 50 } satisfies ConversationPage;
    },
    enabled: Boolean(forwardingMessage) && accountQuery.data?.status === 'connected',
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });
  const filteredConversations = (conversationsQuery.data?.items ?? []).filter((conversation) => {
    const matchesFilter =
      conversationFilter === 'all' ||
      (conversationFilter === 'unread' && conversation.unread_count > 0) ||
      (conversationFilter === 'groups' && conversation.is_group) ||
      (conversationFilter === 'private' && !conversation.is_group);
    const query = conversationSearch.trim().toLocaleLowerCase();
    const digits = query.replace(/\D/gu, '');
    const matchesSearch =
      !query ||
      (conversationSearch.trim() === debouncedConversationSearch && Boolean(debouncedConversationSearch)) ||
      `${conversation.name} ${conversation.jid}`.toLocaleLowerCase().includes(query) ||
      (digits.length > 0 && conversation.jid.replace(/\D/gu, '').includes(digits));
    return matchesFilter && matchesSearch;
  });
  const activeConversation =
    filteredConversations.find((item) => item.id === selected) ?? filteredConversations[0];
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id;
  }, [activeConversation?.id]);
  const messagesQuery = useQuery({
    queryKey: scopedQueryKey(['whatsapp', 'messages', activeConversation?.id]),
    queryFn: async () =>
      (
        await client.request<{ data: Message[] }>(
          `/whatsapp/conversations/${activeConversation!.id}/messages?limit=50&offset=0`
        )
      ).data,
    enabled: accountQuery.data?.status === 'connected' && Boolean(activeConversation),
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
  });
  const latestMessageId = messagesQuery.data?.[0]?.id;
  useEffect(() => {
    const conversationId = activeConversation?.id;
    const previous = latestMessageRef.current;
    if (previous.conversationId !== conversationId) {
      latestMessageRef.current = { conversationId, messageId: latestMessageId };
      isNearLatestRef.current = true;
      setHasNewMessages(false);
      if (conversationId !== undefined) {
        window.requestAnimationFrame(() => {
          if (activeConversationIdRef.current === conversationId && messageContainerRef.current) {
            messageContainerRef.current.scrollTop = 0;
          }
        });
      }
      return;
    }
    if (latestMessageId === undefined || latestMessageId === previous.messageId) return;
    latestMessageRef.current.messageId = latestMessageId;
    if (isNearLatestRef.current) {
      messageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setHasNewMessages(true);
    }
  }, [activeConversation?.id, latestMessageId]);

  const loadMoreConversations = async () => {
    const current = queryClient.getQueryData<ConversationPage>(conversationsQueryKey);
    if (!current?.hasMore || loadingMoreConversationsRef.current) return;
    loadingMoreConversationsRef.current = true;
    setLoadingMoreConversations(true);
    try {
      const page = (
        await client.request<{ data: Conversation[] }>(
          `/whatsapp/conversations?limit=50&offset=${current.nextOffset}&archived=${showArchived}&unread=${conversationFilter === 'unread'}${debouncedConversationSearch ? `&search=${encodeURIComponent(debouncedConversationSearch)}` : ''}`
        )
      ).data;
      queryClient.setQueryData<ConversationPage>(conversationsQueryKey, (latest) => {
        const currentItems = latest?.items ?? current.items;
        const ids = new Set(currentItems.map((conversation) => conversation.id));
        return {
          items: [...currentItems, ...page.filter((conversation) => !ids.has(conversation.id))],
          nextOffset: current.nextOffset + page.length,
          hasMore: page.length === 50,
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load more conversations');
    } finally {
      loadingMoreConversationsRef.current = false;
      setLoadingMoreConversations(false);
    }
  };

  const loadMoreForwardDestinations = async () => {
    const current = queryClient.getQueryData<ConversationPage>(forwardDestinationsQueryKey);
    if (!current?.hasMore || loadingMoreForwardDestinations) return;
    setLoadingMoreForwardDestinations(true);
    try {
      const page = (
        await client.request<{ data: Conversation[] }>(
          `/whatsapp/conversations?limit=50&offset=${current.nextOffset}&archived=${forwardShowArchived}&unread=false${debouncedForwardConversationSearch ? `&search=${encodeURIComponent(debouncedForwardConversationSearch)}` : ''}`
        )
      ).data;
      queryClient.setQueryData<ConversationPage>(forwardDestinationsQueryKey, (latest) => {
        const latestPage = latest ?? current;
        const ids = new Set(latestPage.items.map((conversation) => conversation.id));
        const uniquePage = page.filter((conversation) => !ids.has(conversation.id));
        return {
          items: [...latestPage.items, ...uniquePage],
          nextOffset: current.nextOffset + page.length,
          hasMore: page.length === 50,
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load more destinations');
    } finally {
      setLoadingMoreForwardDestinations(false);
    }
  };

  const markConversationRead = async () => {
    if (!activeConversation || markingRead) return;
    setMarkingRead(true);
    try {
      await client.request(`/whatsapp/conversations/${activeConversation.id}/read`, {
        method: 'POST',
      });
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
      toast.success('Latest message marked as read');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark conversation as read');
    } finally {
      setMarkingRead(false);
    }
  };

  const updateConversationArchive = async () => {
    if (!activeConversation || updatingConversation) return;
    setUpdatingConversation(true);
    try {
      const archived = !activeConversation.is_archived;
      await client.request(`/whatsapp/conversations/${activeConversation.id}/archive`, {
        method: 'POST',
        body: { archived },
      });
      queryClient.setQueryData<ConversationPage>(conversationsQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== activeConversation.id),
            }
          : current
      );
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
      toast.success(activeConversation.is_archived ? 'Conversation unarchived' : 'Conversation archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update archive state');
    } finally {
      setUpdatingConversation(false);
    }
  };

  const updateConversationPin = async () => {
    if (!activeConversation || updatingConversation) return;
    setUpdatingConversation(true);
    try {
      const pinned = !activeConversation.is_pinned;
      await client.request(`/whatsapp/conversations/${activeConversation.id}/pin`, {
        method: 'POST',
        body: { pinned },
      });
      queryClient.setQueryData<ConversationPage>(conversationsQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === activeConversation.id ? { ...item, is_pinned: pinned } : item
              ),
            }
          : current
      );
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
      toast.success(activeConversation.is_pinned ? 'Conversation unpinned' : 'Conversation pinned');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update pin state');
    } finally {
      setUpdatingConversation(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const code = accountQuery.data?.qr_code;
    if (!code) return;
    if (code.startsWith('data:image/')) return;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(code, { width: 256, margin: 1 }))
      .then((image) => {
        if (!cancelled) setQr({ code, image });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountQuery.data?.qr_code]);

  const connect = async () => {
    try {
      await client.request('/whatsapp/connect', { method: 'POST', body: {} });
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start WhatsApp connection');
    }
  };
  const forwardTo = async (destination: Conversation) => {
    if (!forwardingMessage || forwarding) return;
    if (
      forwardIdempotencyKey.current?.sourceId !== forwardingMessage.id ||
      forwardIdempotencyKey.current?.destinationId !== destination.id
    ) {
      forwardIdempotencyKey.current = {
        sourceId: forwardingMessage.id,
        destinationId: destination.id,
        key: crypto.randomUUID(),
      };
    }
    setForwarding(true);
    try {
      await client.request(`/whatsapp/messages/${forwardingMessage.id}/forward`, {
        method: 'POST',
        headers: { 'Idempotency-Key': forwardIdempotencyKey.current.key },
        body: { conversation_id: destination.id },
      });
      forwardIdempotencyKey.current = null;
      setForwardingMessage(null);
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
      toast.success('Forward queued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message could not be forwarded');
    } finally {
      setForwarding(false);
    }
  };
  const disconnect = async () => {
    try {
      await client.request('/whatsapp/disconnect', { method: 'POST', body: {} });
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect WhatsApp');
    }
  };
  const startChat = async (event: FormEvent) => {
    event.preventDefault();
    if (startingChat) return;
    setStartingChat(true);
    try {
      const response = await client.request<{ data: Conversation }>('/whatsapp/conversations', {
        method: 'POST',
        body: { phone: newPhone.trim() },
      });
      setNewPhone('');
      await queryClient.invalidateQueries({
        queryKey: scopedQueryKey(['whatsapp', 'conversations']),
      });
      setSelected(response.data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start conversation');
    } finally {
      setStartingChat(false);
    }
  };

  const account = accountQuery.data;
  const status = account?.status ?? 'disconnected';
  const connected = status === 'connected';
  const canManage = account?.permissions?.manage ?? false;
  const canCreateConversation = account?.permissions?.createConversation ?? false;
  const canManageConversations = account?.permissions?.manageConversations ?? canManage;
  const canSend = account?.permissions?.send ?? false;
  const statusIcon = connected ? (
    <SignalIcon className="size-4" />
  ) : (
    <SignalOffIcon className="size-4" />
  );
  const currentOlderPage =
    olderPage?.conversationId === activeConversation?.id ? olderPage : null;
  const olderMessages = currentOlderPage?.messages ?? [];
  const olderMessageOffset = currentOlderPage?.nextOffset ?? messagesQuery.data?.length ?? 50;
  const hasOlderMessages = currentOlderPage?.hasMore ?? messagesQuery.data?.length === 50;
  const loadingOlderMessages = loadingOlderConversationId === activeConversation?.id;
  const messageList = Array.from(
    new Map(
      [...(messagesQuery.data ?? []), ...olderMessages].map((message) => [message.id, message])
    ).values()
  );
  const readCursorIndex = messageList.findIndex((message) => message.is_last_read);
  const oldestUnreadIndex = messageList.reduce(
    (oldestIndex, message, index) => (message.is_unread ? index : oldestIndex),
    -1
  );
  const newMessagesDividerIndex =
    readCursorIndex >= 0
      ? readCursorIndex
      : oldestUnreadIndex >= 0
        ? oldestUnreadIndex + 1
        : -1;
  const loadOlderMessages = async () => {
    if (!activeConversation || !hasOlderMessages) return;
    const requestedConversationId = activeConversation.id;
    if (loadingOlderRef.current === requestedConversationId) return;
    loadingOlderRef.current = requestedConversationId;
    setLoadingOlderConversationId(requestedConversationId);
    try {
      const page = (
        await client.request<{ data: Message[] }>(
          `/whatsapp/conversations/${requestedConversationId}/messages?limit=50&offset=${olderMessageOffset}`
        )
      ).data;
      if (activeConversationIdRef.current !== requestedConversationId) return;
      setOlderPage((current) => {
        const currentMessages = current?.conversationId === requestedConversationId
          ? current.messages
          : [];
        const byId = new Map(currentMessages.map((message) => [message.id, message]));
        for (const message of page) byId.set(message.id, message);
        return {
          conversationId: requestedConversationId,
          messages: [...byId.values()],
          nextOffset: olderMessageOffset + page.length,
          hasMore: page.length === 50,
        };
      });
    } catch (error) {
      if (activeConversationIdRef.current === requestedConversationId) {
        toast.error(error instanceof Error ? error.message : 'Could not load older messages');
      }
    } finally {
      if (loadingOlderRef.current === requestedConversationId) {
        loadingOlderRef.current = null;
        setLoadingOlderConversationId((current) =>
          current === requestedConversationId ? null : current
        );
      }
    }
  };
  const jumpToQuotedMessage = async (message: Message) => {
    const targetId = message.reply_to?.id;
    const conversationId = activeConversation?.id;
    if (!targetId || !conversationId) return;
    if (!document.getElementById(`whatsapp-message-${targetId}`)) {
      if (loadingOlderRef.current === conversationId) return;
      loadingOlderRef.current = conversationId;
      setLoadingOlderConversationId(conversationId);
      let offset = olderMessageOffset;
      let hasMore = hasOlderMessages;
      const loaded = [...olderMessages];
      try {
        while (hasMore && offset < 5_000 && activeConversationIdRef.current === conversationId) {
          const page = (
            await client.request<{ data: Message[] }>(
              `/whatsapp/conversations/${conversationId}/messages?limit=50&offset=${offset}`
            )
          ).data;
          loaded.push(...page);
          offset += page.length;
          hasMore = page.length === 50;
          if (page.some((item) => item.id === targetId)) break;
        }
        setOlderPage((current) => {
          const existing = current?.conversationId === conversationId ? current.messages : [];
          const byId = new Map([...existing, ...loaded].map((item) => [item.id, item]));
          return { conversationId, messages: [...byId.values()], nextOffset: offset, hasMore };
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not load the quoted message');
        return;
      } finally {
        loadingOlderRef.current = null;
        setLoadingOlderConversationId((current) => (current === conversationId ? null : current));
      }
      if (!loaded.some((item) => item.id === targetId)) {
        toast.error('Quoted message is outside the available history');
        return;
      }
    }
    window.requestAnimationFrame(() => {
      const element = document.getElementById(`whatsapp-message-${targetId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    });
  };
  const qrImage = account?.qr_code?.startsWith('data:image/')
    ? account.qr_code
    : qr && qr.code === account?.qr_code
      ? qr.image
      : null;
  const lastInboxSyncLabel = conversationsQuery.dataUpdatedAt
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(conversationsQuery.dataUpdatedAt)
      )
    : null;
  const retryWhatsAppData = () => {
    const retries: Promise<unknown>[] = [accountQuery.refetch(), conversationsQuery.refetch()];
    if (connected && activeConversation) retries.push(messagesQuery.refetch());
    void Promise.all(retries);
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 p-4 md:p-8">
      <Breadcrumbs items={[{ label: 'WhatsApp' }]} />
      {forwardingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-forward-title"
            className="w-full max-w-md border-2 border-ink bg-cream p-5 shadow-[6px_6px_0_#171717]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="whatsapp-forward-title" className="font-display text-xl uppercase">
                  Forward message
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-ink-faint">
                  {forwardingMessage.content || `[${forwardingMessage.message_type}]`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={forwarding}
                onClick={() => setForwardingMessage(null)}
              >
                Cancel
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                aria-label="Search forward destinations"
                placeholder="Search chats and groups"
                value={forwardConversationSearch}
                onChange={(event) => setForwardConversationSearch(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={forwardShowArchived}
                  onChange={(event) => setForwardShowArchived(event.target.checked)}
                  aria-label="Include archived conversations"
                />
                Include archived conversations
              </label>
              {forwardDestinationsQuery.isError && (
                <div role="alert" className="flex items-center justify-between gap-3 text-sm">
                  <span>Destinations could not be loaded.</span>
                  <Button type="button" variant="link" onClick={() => void forwardDestinationsQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              )}
              <div className="max-h-72 space-y-2 overflow-y-auto" aria-label="Forward destinations">
              {(forwardDestinationsQuery.data?.items ?? []).map((conversation) => (
                <Button
                  key={conversation.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left"
                  disabled={forwarding}
                  aria-label={`Forward to ${conversation.name}`}
                  onClick={() => void forwardTo(conversation)}
                >
                  {conversation.name}
                  {conversation.is_group ? ' · Group' : ''}
                </Button>
              ))}
              {forwardDestinationsQuery.isLoading && <Skeleton className="h-10 w-full" />}
              {!forwardDestinationsQuery.isLoading && !forwardDestinationsQuery.data?.items.length && (
                <p className="p-3 text-sm text-ink-faint">No matching conversations.</p>
              )}
              {forwardDestinationsQuery.data?.hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loadingMoreForwardDestinations}
                  onClick={() => void loadMoreForwardDestinations()}
                >
                  {loadingMoreForwardDestinations ? 'Loading…' : 'Load more destinations'}
                </Button>
              )}
              </div>
            </div>
          </section>
        </div>
      )}
      {(accountQuery.isError || conversationsQuery.isError || messagesQuery.isError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-pink p-3 text-sm">
          <p>
            WhatsApp data could not be refreshed.
            {conversationsQuery.data && lastInboxSyncLabel
              ? ` Showing inbox data last updated at ${lastInboxSyncLabel}.`
              : ' No inbox data is available yet.'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={accountQuery.isFetching || conversationsQuery.isFetching || messagesQuery.isFetching}
            onClick={retryWhatsAppData}
          >
            Retry
          </Button>
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-paper p-5 shadow-[4px_4px_0_0_var(--ink)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
            Company inbox
          </p>
          <h1 className="font-display text-3xl uppercase">WhatsApp</h1>
          <p className="mt-1 flex items-center gap-2 text-sm">
            {statusIcon}
            <span>{statusLabel[status] ?? status}</span>
            {account?.phone_number && <span className="font-mono">+{account.phone_number}</span>}
          </p>
          {account?.last_error && <p className="mt-2 text-sm text-red-700">{account.last_error}</p>}
        </div>
        {!canManage ? (
          <span className="text-sm text-ink-faint">View-only WhatsApp access</span>
        ) : ['connected', 'connecting', 'qr', 'reconnecting'].includes(status) ? (
          <Button type="button" variant="outline" onClick={disconnect}>
            {connected ? 'Disconnect' : 'Cancel connection'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={connect}
            disabled={['connecting', 'qr', 'reconnecting'].includes(status)}
          >
            <SmartphoneIcon className="mr-2 size-4" />
            {status === 'qr_expired' ? 'Refresh QR code' : 'Connect WhatsApp'}
          </Button>
        )}
      </header>
      {status === 'qr' && (
        <section className="flex flex-col items-center border-2 border-ink bg-white p-6 text-center shadow-[4px_4px_0_0_var(--ink)]">
          <h2 className="font-display text-xl uppercase">Scan with WhatsApp</h2>
          <p className="mt-1 text-sm">Open Linked devices on your phone and scan this code.</p>
          {qrImage ? (
            <img src={qrImage} alt="WhatsApp connection QR code" className="mt-4 size-64" />
          ) : (
            <Skeleton className="mt-4 size-64" />
          )}
        </section>
      )}
      {connected && (
        <section className="grid min-h-[60vh] flex-1 overflow-hidden border-2 border-ink bg-paper shadow-[4px_4px_0_0_var(--ink)] md:grid-cols-[minmax(240px,0.38fr)_1fr]">
          <aside className="border-b-2 border-ink md:border-b-0 md:border-r-2">
            <div className="border-b-2 border-ink p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg uppercase">Conversations</h2>
                {lastInboxSyncLabel && (
                  <p role="status" className="font-mono text-[10px] text-ink-faint">
                    Last synced {lastInboxSyncLabel}
                  </p>
                )}
              </div>
              <Input
                aria-label="Search conversations by name, number, or message"
                className="mt-3"
                placeholder="Search name, number, or message"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2" aria-label="Conversation filters">
                {(['all', 'unread', 'private', 'groups'] as const).map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={conversationFilter === filter ? 'default' : 'outline'}
                    aria-pressed={conversationFilter === filter}
                    onClick={() => setConversationFilter(filter)}
                  >
                    {filter === 'all'
                      ? 'All'
                      : filter === 'unread'
                        ? 'Unread'
                        : filter === 'private'
                          ? 'Private'
                          : 'Groups'}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex gap-2" aria-label="Archive filter">
                <Button
                  type="button"
                  size="sm"
                  variant={!showArchived ? 'default' : 'outline'}
                  aria-pressed={!showArchived}
                  onClick={() => setShowArchived(false)}
                >
                  Active
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showArchived ? 'default' : 'outline'}
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived(true)}
                >
                  Archived
                </Button>
              </div>
              {canCreateConversation && (
                <form onSubmit={startChat} className="mt-3 flex gap-2">
                  <Input
                    aria-label="Phone number with country code"
                    placeholder="6281234567890"
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                    disabled={startingChat}
                    inputMode="tel"
                  />
                  <Button type="submit" disabled={startingChat || !newPhone.trim()}>
                    New chat
                  </Button>
                </form>
              )}
            </div>
            {conversationsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : conversationsQuery.isError && !conversationsQuery.data ? (
              <div className="space-y-3 p-4" role="alert">
                <p className="text-sm">Conversations could not be loaded.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={conversationsQuery.isFetching}
                  onClick={() => void conversationsQuery.refetch()}
                >
                  Retry inbox
                </Button>
              </div>
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <Button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelected(conversation.id)}
                  variant="ghost"
                  className={`h-auto w-full justify-start border-b border-ink/20 p-4 text-left hover:bg-pink/20 ${activeConversation?.id === conversation.id ? 'bg-pink/30' : ''}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {conversation.is_group && <UsersIcon className="size-4" />}
                    {conversation.name}
                    {conversation.is_pinned && <span className="text-xs">Pinned</span>}
                    {conversation.unread_count > 0 && (
                      <span className="ml-auto rounded-full bg-pink px-2 text-xs">
                        {conversation.unread_count}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-sm text-ink-faint">
                    {conversation.last_message}
                  </span>
                </Button>
              ))
            ) : (
              <p className="p-4 text-sm text-ink-faint">
                {conversationsQuery.data?.items.length
                  ? 'No conversations match this search or filter.'
                  : 'No conversations yet.'}
              </p>
            )}
            {conversationsQuery.data?.hasMore && (
              <Button
                type="button"
                variant="link"
                className="mx-auto my-2"
                disabled={loadingMoreConversations}
                onClick={() => void loadMoreConversations()}
              >
                {loadingMoreConversations ? 'Loading conversations…' : 'Load more conversations'}
              </Button>
            )}
          </aside>
          <div className="flex h-[70vh] min-h-[55vh] max-h-[calc(100dvh-8rem)] flex-col">
            <div className="border-b-2 border-ink p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-lg uppercase">
                    {activeConversation?.name ?? 'Select a conversation'}
                  </h2>
                  {activeConversation && (
                    <p className="break-all text-xs text-ink-faint">
                      {formatConversationAddress(activeConversation)}
                    </p>
                  )}
                </div>
                {activeConversation && canManageConversations && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updatingConversation}
                      onClick={() => void updateConversationPin()}
                    >
                      {activeConversation.is_pinned ? 'Unpin chat' : 'Pin chat'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updatingConversation}
                      onClick={() => void updateConversationArchive()}
                    >
                      {activeConversation.is_archived ? 'Unarchive chat' : 'Archive chat'}
                    </Button>
                  </div>
                )}
                {activeConversation && canSend &&
                  messagesQuery.data?.some((message) => message.direction === 'inbound') && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={markingRead}
                      onClick={() => void markConversationRead()}
                    >
                      {markingRead ? 'Marking read…' : 'Mark latest as read'}
                    </Button>
                  )}
              </div>
              {activeConversation?.is_group && (
                <span className="text-xs text-ink-faint">Group conversation</span>
              )}
            </div>
            {hasOlderMessages && (
              <Button
                type="button"
                variant="link"
                className="mx-auto"
                disabled={loadingOlderMessages}
                onClick={() => void loadOlderMessages()}
              >
                {loadingOlderMessages ? 'Loading older messages…' : 'Load older messages'}
              </Button>
            )}
            {hasNewMessages && (
              <Button
                type="button"
                size="sm"
                className="mx-auto"
                onClick={() => {
                  isNearLatestRef.current = true;
                  setHasNewMessages(false);
                  messageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                New messages · Jump to latest
              </Button>
            )}
            <div
              ref={messageContainerRef}
              className="min-h-0 flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4"
              onScroll={(event) => {
                const nearLatest = event.currentTarget.scrollTop >= -48;
                isNearLatestRef.current = nearLatest;
                if (nearLatest) {
                  if (hasNewMessages) setHasNewMessages(false);
                } else {
                  void loadOlderMessages();
                }
              }}
            >
              {messagesQuery.isError && !messagesQuery.data && (
                <div className="space-y-3 border-2 border-ink bg-pink p-3" role="alert">
                  <p className="text-sm">Messages could not be loaded.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={messagesQuery.isFetching}
                    onClick={() => void messagesQuery.refetch()}
                  >
                    Retry messages
                  </Button>
                </div>
              )}
              {messagesQuery.isError && messagesQuery.data && (
                <p role="status" className="border border-ink/40 p-2 text-xs text-ink-faint">
                  Showing cached messages. Refresh failed; retrying automatically.
                </p>
              )}
              {messageList.map((message, index) => (
                <div key={message.id} className="contents">
                  {activeConversation?.unread_count > 0 && index === newMessagesDividerIndex && (
                    <div
                      role="separator"
                      aria-label="New messages"
                      className="w-full border-y border-ink/40 py-1 text-center text-xs font-semibold text-ink-faint"
                    >
                      New messages
                    </div>
                  )}
                  <article
                    id={`whatsapp-message-${message.id}`}
                    tabIndex={-1}
                    className={`group relative max-w-[85%] border-2 border-ink p-3 ${message.direction === 'outbound' ? 'ml-auto bg-pink/30' : 'mr-auto bg-white'}`}
                  >
                  {activeConversation?.is_group &&
                    message.direction === 'inbound' &&
                    message.sender_jid && (
                      <p className="mb-1 font-mono text-[10px] text-ink-faint">
                        {message.sender_jid.split('@')[0]?.split(':')[0]}
                      </p>
                    )}
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  {message.is_forwarded && (
                    <p className="mb-1 font-mono text-[10px] italic text-ink-faint">Forwarded</p>
                  )}
                  {message.reply_to && (
                    <Button
                      type="button"
                      variant="link"
                      className="mb-2 block h-auto w-full border-l-2 border-magenta pl-2 text-left text-xs text-ink-faint hover:text-ink"
                      onClick={() => void jumpToQuotedMessage(message)}
                      aria-label="Jump to quoted message"
                    >
                      {message.reply_to.unavailable
                        ? 'Quoted message unavailable'
                        : message.reply_to.content || `[${message.reply_to.message_type || 'media'}]`}
                    </Button>
                  )}
                  {message.message_type !== 'text' && <MediaPreview message={message} />}
                  {message.media_file_name && (
                    <p className="mt-1 text-xs">{message.media_file_name}</p>
                  )}
                  {message.content && (
                    <Button
                      type="button"
                      variant="link"
                      className="absolute right-2 top-2 z-10 h-auto p-1 text-xs underline md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label="Copy message"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(message.content ?? '');
                          toast.success('Message copied');
                        } catch {
                          toast.error('Could not copy message text');
                        }
                      }}
                    >
                      Copy
                    </Button>
                  )}
                  {canSend && !['queued', 'sending', 'unknown'].includes(message.status) && (
                    <Button
                      type="button"
                      variant="link"
                      className="mt-1 h-auto p-0 text-xs underline"
                      aria-label="Reply to message"
                      onClick={() => setReplyingTo(message)}
                    >
                      Reply
                    </Button>
                  )}
                  {canSend && ['received', 'sent', 'delivered', 'read'].includes(message.status) && (
                    <Button
                      type="button"
                      variant="link"
                      className="ml-3 mt-1 h-auto p-0 text-xs underline"
                      aria-label="Forward message"
                      onClick={() => {
                        setForwardConversationSearch('');
                        setDebouncedForwardConversationSearch('');
                        setForwardShowArchived(false);
                        setForwardingMessage(message);
                      }}
                    >
                      Forward
                    </Button>
                  )}
                  <p className="mt-2 flex flex-wrap justify-end gap-x-2 text-right font-mono text-[10px] text-ink-faint">
                    <time dateTime={message.create_date}>
                      {formatDateTime(message.create_date, 'dateTime')}
                    </time>
                    <span>{messageStatusLabel[message.status] ?? 'Status unavailable'}</span>
                  </p>
                  {message.last_error && (
                    <p role="status" className="mt-1 text-xs text-red-700">
                      {message.last_error}
                    </p>
                  )}
                  {message.status === 'failed' && message.retryable && (
                    <Button
                      type="button"
                      variant="link"
                      className="mt-1 h-auto p-0 text-xs underline"
                      onClick={async () => {
                        try {
                          await client.request(`/whatsapp/messages/${message.id}/retry`, {
                            method: 'POST',
                          });
                          await queryClient.invalidateQueries({
                            queryKey: scopedQueryKey(['whatsapp']),
                          });
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : 'Retry could not be queued'
                          );
                        }
                      }}
                    >
                      Retry send
                    </Button>
                  )}
                  </article>
                </div>
              ))}
              {activeConversation?.unread_count > 0 &&
                newMessagesDividerIndex === messageList.length && (
                  <div
                    role="separator"
                    aria-label="New messages"
                    className="w-full border-y border-ink/40 py-1 text-center text-xs font-semibold text-ink-faint"
                  >
                    New messages
                  </div>
                )}
            </div>
            {activeConversation && canSend ? (
              <MessageComposer
                key={activeConversation.id}
                conversationId={activeConversation.id}
                replyTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                sendOnEnter={inboxPreferences.sendOnEnter}
                onSendOnEnterChange={(sendOnEnter) =>
                  setInboxPreferences((current) => ({ ...current, sendOnEnter }))
                }
              />
            ) : activeConversation ? (
              <p className="border-t-2 border-ink p-3 text-sm text-ink-faint">
                You have view-only access to WhatsApp messages.
              </p>
            ) : null}
          </div>
        </section>
      )}
      {!connected && status !== 'qr' && (
        <section className="border-2 border-ink bg-white p-8 text-center">
          <SmartphoneIcon className="mx-auto size-10" />
          <h2 className="mt-3 font-display text-xl uppercase">Connect a WhatsApp account</h2>
          <p className="mt-1 text-sm text-ink-faint">
            One WhatsApp account is available for this company.
          </p>
        </section>
      )}
    </main>
  );
}

function MessageComposer({
  conversationId,
  replyTo,
  onCancelReply,
  sendOnEnter,
  onSendOnEnterChange,
}: {
  conversationId: number;
  replyTo: Message | null;
  onCancelReply: () => void;
  sendOnEnter: boolean;
  onSendOnEnterChange: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, [replyTo?.id]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sendLock.current || (!draft.trim() && !file)) return;
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('File must be 10 MiB or smaller');
      return;
    }
    sendLock.current = true;
    setSending(true);
    try {
      const media_base64 = file
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
          })
        : undefined;
      await client.request(`/whatsapp/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          content: draft.trim(),
          ...(replyTo ? { reply_to_message_id: replyTo.id } : {}),
          ...(file
            ? {
                media_base64,
                media_mime_type: file.type || 'application/octet-stream',
                media_file_name: file.name,
              }
            : {}),
        },
      });
      setDraft('');
      setFile(null);
      onCancelReply();
      idempotencyKey.current = crypto.randomUUID();
      if (fileInput.current) fileInput.current.value = '';
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message could not be queued');
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const shouldSend = sendOnEnter
      ? event.key === 'Enter' && !event.shiftKey
      : event.key === 'Enter' && (event.ctrlKey || event.metaKey);
    if (!shouldSend) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-2 border-t-2 border-ink p-3">
      {replyTo && (
        <div className="flex items-start justify-between gap-3 border-l-2 border-magenta bg-cream p-2 text-xs">
          <p className="min-w-0 truncate">
            Replying to: {replyTo.content || `[${replyTo.message_type}]`}
          </p>
          <Button type="button" variant="link" className="h-auto p-0 underline" onClick={onCancelReply}>
            Cancel reply
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label
          className="cursor-pointer rounded border-2 border-ink p-2 hover:bg-pink/20"
          title="Attach media"
        >
          <span className="sr-only">Attach media</span>
          <AttachmentIcon className="size-4" />
          <Input
            type="file"
            ref={fileInput}
            disabled={sending}
            aria-label="Attach media"
            className="sr-only"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              if (selected && selected.size > MAX_ATTACHMENT_BYTES) {
                toast.error('File must be 10 MiB or smaller');
                event.target.value = '';
                setFile(null);
                return;
              }
              setFile(selected);
              idempotencyKey.current = crypto.randomUUID();
            }}
          />
        </label>
        <Textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            idempotencyKey.current = crypto.randomUUID();
          }}
          placeholder="Write a message…"
          aria-label="Write a message"
          maxLength={8000}
          disabled={sending}
          rows={2}
          onKeyDown={handleComposerKeyDown}
          className="min-h-10 resize-y"
        />
        <Button
          type="submit"
          disabled={sending || (!draft.trim() && !file)}
          aria-label={sending ? 'Sending message' : 'Send message'}
        >
          {sending ? 'Sending…' : <SendIcon className="size-4" />}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-faint">
          <Checkbox
            checked={sendOnEnter}
            onChange={(event) => onSendOnEnterChange(event.target.checked)}
            aria-label="Press Enter to send"
          />
          Press Enter to send
        </label>
        <p className="text-[10px] text-ink-faint">
          {sendOnEnter ? 'Shift+Enter for a new line' : 'Ctrl+Enter to send'} · Media files up to 10 MiB
        </p>
      </div>
      {file && (
        <p className="text-xs">
          Attached: {file.name}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 underline"
            onClick={() => {
              setFile(null);
              idempotencyKey.current = crypto.randomUUID();
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            Remove
          </Button>
        </p>
      )}
    </form>
  );
}

function MediaPreview({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState('Attachment could not be loaded.');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void client
      .request<Blob>(`/whatsapp/media/${message.id}`, { responseType: 'blob' })
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          setMimeType(blob.type || 'application/octet-stream');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFailureMessage(mediaLoadFailureMessage(error));
          setFailed(true);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, attempt]);
  if (failed)
    return (
      <div role="status" className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
        <span>{failureMessage}</span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 underline"
          onClick={() => {
            setFailed(false);
            setFailureMessage('Attachment could not be loaded.');
            setUrl(null);
            setMimeType(null);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (!url) return <p className="mt-2 text-xs text-ink-faint">Loading attachment…</p>;
  if (mimeType?.startsWith('image/'))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={message.media_file_name ?? 'WhatsApp media'}
          className="mt-2 max-h-64 max-w-full object-contain"
        />
      </a>
    );
  if (mimeType?.startsWith('video/'))
    return <video controls src={url} className="mt-2 max-h-64 max-w-full" />;
  if (mimeType?.startsWith('audio/'))
    return <audio controls src={url} className="mt-2 max-w-full" />;
  return (
    <a
      href={url}
      download={message.media_file_name ?? 'attachment'}
      className="mt-2 inline-block underline"
    >
      Download attachment
    </a>
  );
}

function mediaLoadFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('10 MiB'))
    return 'This media exceeds the 10 MiB limit and cannot be cached.';
  if (error instanceof ApiError && error.status === 404)
    return 'This attachment is no longer available.';
  if (message === 'Media storage is temporarily unavailable')
    return 'Attachment storage is temporarily unavailable. Try again.';
  if (error instanceof ApiError && (error.status === 502 || message.includes('WhatsApp gateway')))
    return 'WhatsApp could not retrieve this attachment. Try again.';
  if (error instanceof ApiError && error.status === 503)
    return 'WhatsApp services are temporarily busy. Try again.';
  return 'Attachment could not be loaded. Try again.';
}

function readWhatsAppInboxPreferences(key: string): WhatsAppInboxPreferences {
  try {
    if (typeof window === 'undefined') return { ...defaultInboxPreferences };
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...defaultInboxPreferences };
    const value = JSON.parse(raw) as Partial<WhatsAppInboxPreferences>;
    const validFilters: ConversationFilter[] = ['all', 'unread', 'private', 'groups'];
    return {
      selectedConversationId:
        typeof value.selectedConversationId === 'number' &&
        Number.isSafeInteger(value.selectedConversationId) &&
        value.selectedConversationId > 0
          ? value.selectedConversationId
          : null,
      conversationFilter: validFilters.includes(value.conversationFilter as ConversationFilter)
        ? (value.conversationFilter as ConversationFilter)
        : defaultInboxPreferences.conversationFilter,
      showArchived: typeof value.showArchived === 'boolean' ? value.showArchived : false,
      sendOnEnter: typeof value.sendOnEnter === 'boolean' ? value.sendOnEnter : true,
    };
  } catch {
    return { ...defaultInboxPreferences };
  }
}
