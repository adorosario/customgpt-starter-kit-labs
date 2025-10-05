import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConversationStore, Conversation } from '@/types';
import { getClient } from '@/lib/api/client';
import { generateConversationName } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

// Session-based conversation isolation
const getSessionId = (): string => {
  // Check if we're running on the server
  if (typeof window === 'undefined') {
    return 'server-session';
  }
  
  // Use the current widget session if available
  if ((window as any).__customgpt_current_session) {
    return (window as any).__customgpt_current_session;
  }
  
  // Check if we're in widget mode with session configuration
  if ((window as any).__customgpt_session) {
    return (window as any).__customgpt_session.sessionId;
  }
  
  // Check for instance-specific sessions (for isolated widgets)
  if ((window as any).__customgpt_sessions) {
    // For isolated widgets, we need to determine which session to use
    // This is tricky since stores are global - we'll use the most recent session
    const sessions = (window as any).__customgpt_sessions;
    const sessionIds = Object.keys(sessions);
    if (sessionIds.length > 0) {
      // Return the most recently created session
      return sessionIds[sessionIds.length - 1];
    }
  }
  
  // Fallback to browser-based session ID
  try {
    let sessionId = sessionStorage.getItem('customgpt_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('customgpt_session_id', sessionId);
    }
    return sessionId;
  } catch (e) {
    // Fallback if sessionStorage is not available
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversation: null,
      loading: false,
      error: null,
      // Pagination state
      currentPage: 1,
      totalPages: 1,
      totalConversations: 0,
      perPage: 20,
      // Sorting and filtering state
      sortOrder: 'desc' as const,
      sortBy: 'id',
      userFilter: 'all' as const,
      // Client-side filtering state
      allConversations: [], // Raw conversations from API
      searchQuery: '',
      searchMode: 'name' as const,
      dateFilter: 'all' as const,

      // Client-side filtering helper function
      applyFilters: () => {
        const state = get();
        let filtered = [...state.allConversations];
        
        // Apply search filter
        if (state.searchQuery.trim()) {
          const query = state.searchQuery.toLowerCase().trim();
          filtered = filtered.filter(conv => {
            switch (state.searchMode) {
              case 'name':
                return conv.name.toLowerCase().includes(query);
              case 'id':
                return conv.id.toString().includes(query);
              case 'session':
                return conv.session_id.toLowerCase().includes(query);
              default:
                return conv.name.toLowerCase().includes(query);
            }
          });
        }
        
        // Apply date filter
        if (state.dateFilter !== 'all') {
          const now = new Date();
          const filterDate = new Date();
          
          switch (state.dateFilter) {
            case 'today':
              filterDate.setHours(0, 0, 0, 0);
              break;
            case 'week':
              filterDate.setDate(now.getDate() - 7);
              break;
            case 'month':
              filterDate.setDate(now.getDate() - 30);
              break;
          }
          
          filtered = filtered.filter(conv => {
            const convDate = new Date(conv.updated_at);
            return convDate >= filterDate;
          });
        }
        
        // Note: User filter and sorting are handled server-side by the API
        // We don't apply them client-side to avoid conflicts
        
        set({ conversations: filtered });
      },

      // Update search filters
      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
        get().applyFilters();
      },

      setSearchMode: (mode: 'name' | 'id' | 'session') => {
        set({ searchMode: mode });
        get().applyFilters();
      },

      setDateFilter: (filter: 'all' | 'today' | 'week' | 'month') => {
        set({ dateFilter: filter });
        get().applyFilters();
      },

      fetchConversations: async (projectId: number, params?: {
        page?: number;
        per_page?: number;
        order?: 'asc' | 'desc';
        orderBy?: string;
        userFilter?: 'all' | 'me' | string;
        searchQuery?: string;
        searchMode?: 'name' | 'id' | 'session';
        dateFilter?: 'today' | 'week' | 'month';
      }) => {
        logger.info('CONVERSATIONS', 'Fetching conversations', { projectId, params });
        set({ loading: true, error: null });
        
        // Update client-side filter state if provided
        if (params?.searchQuery !== undefined) {
          set({ searchQuery: params.searchQuery });
        }
        if (params?.searchMode !== undefined) {
          set({ searchMode: params.searchMode });
        }
        if (params?.dateFilter !== undefined) {
          set({ dateFilter: params.dateFilter });
        }
        
        try {
          const client = getClient();
          // Only send API-supported parameters
          const apiParams = {
            page: params?.page ?? get().currentPage,
            per_page: params?.per_page ?? get().perPage,
            order: params?.order ?? get().sortOrder,
            orderBy: params?.orderBy ?? get().sortBy,
            userFilter: params?.userFilter ?? get().userFilter,
          };
          
          const response = await client.getConversations(projectId, apiParams);
          logger.info('CONVERSATIONS', 'API response received', { 
            projectId,
            responseType: typeof response,
            hasData: !!(response as any)?.data,
            dataLength: Array.isArray((response as any)?.data) ? (response as any).data.length : 0
          });
          
          // Handle different response formats
          let conversations = [];
          let paginationData = null;
          
          if (response && typeof response === 'object') {
            // Standard paginated response format
            if ((response as any).data && (response as any).data.data) {
              conversations = (response as any).data.data;
              paginationData = (response as any).data;
            } else if (Array.isArray((response as any).data)) {
              conversations = (response as any).data;
            } else if (Array.isArray(response)) {
              conversations = response;
            }
          }
          
          logger.info('CONVERSATIONS', 'Processed conversations', {
            count: conversations.length,
            paginationData,
            conversations: conversations.map((c: any) => ({ 
              id: c.id, 
              name: c.name,
              messagesCount: c.messages?.length || 0 
            }))
          });
          
          // Update state with conversations and pagination data
          set({ 
            allConversations: conversations, // Store raw conversations from API
            loading: false,
            // Update pagination state if available
            currentPage: paginationData?.current_page ?? 1,
            totalPages: paginationData?.last_page ?? 1,
            totalConversations: paginationData?.total ?? conversations.length,
            // Update sorting/filtering if params were provided
            ...(params?.order && { sortOrder: params.order }),
            ...(params?.orderBy && { sortBy: params.orderBy }),
            ...(params?.userFilter && { userFilter: params.userFilter }),
          });
          
          // Apply client-side filters
          get().applyFilters();
        } catch (error) {
          logger.error('CONVERSATIONS', 'Failed to fetch conversations', error, {
            projectId,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            status: (error as any)?.status,
            message: (error as any)?.message
          });
          
          // Handle specific error types with appropriate toast notifications
          const errorStatus = (error as any)?.status;
          const errorMessage = (error as any)?.message || (error as any)?.data?.message;
          
          if (errorStatus === 429) {
            // Rate limit exceeded
            toast.error('Rate limit exceeded', {
              description: 'Too many requests. Please wait a moment before trying again.',
              duration: 5000,
            });
          } else if (errorStatus === 403 && errorMessage?.includes('verification')) {
            // Turnstile verification required
            toast.error('Human verification required', {
              description: 'Please complete the verification to continue.',
              duration: 5000,
            });
          } else if (errorStatus === 401) {
            // Authentication error
            toast.error('Authentication failed', {
              description: 'Please check your API key configuration.',
              duration: 5000,
            });
          } else if (errorStatus === 500) {
            // Server error
            toast.error('Server error', {
              description: 'Please try again later.',
              duration: 5000,
            });
          } else {
            // Generic error
            toast.error('Failed to load conversations', {
              description: errorMessage || 'Please try again.',
              duration: 4000,
            });
          }
          
          // Don't clear existing conversations on error - preserve local state
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch conversations',
            loading: false,
            // Keep existing conversations instead of clearing them
          });
        }
      },

      createConversation: async (projectId: number, name?: string) => {
        set({ loading: true, error: null });
        
        try {
          const client = getClient();
          const response = await client.createConversation(projectId, name ? { name } : undefined);
          const newConversation = response.data;
          
          set(state => ({ 
            allConversations: [newConversation, ...state.allConversations],
            currentConversation: newConversation,
            loading: false,
          }));
          
          // Apply client-side filters
          get().applyFilters();
        } catch (error) {
          console.error('Failed to create conversation:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to create conversation',
            loading: false 
          });
          throw error;
        }
      },

      selectConversation: (conversation: Conversation | null) => {
        set({ currentConversation: conversation });
      },

      deleteConversation: async (conversationId: string | number) => {
        const { conversations, currentConversation } = get();
        const conversation = conversations.find(c => c.id.toString() === conversationId.toString());
        
        if (!conversation) return;

        set({ loading: true, error: null });
        
        try {
          const client = getClient();
          await client.deleteConversation(conversation.project_id, conversation.session_id);
          
          const updatedAllConversations = get().allConversations.filter(c => c.id.toString() !== conversationId.toString());
          
          set({ 
            allConversations: updatedAllConversations,
            currentConversation: currentConversation?.id.toString() === conversationId.toString() 
              ? (updatedAllConversations.length > 0 ? updatedAllConversations[0] : null)
              : currentConversation,
            loading: false,
          });
          
          // Apply client-side filters
          get().applyFilters();
        } catch (error) {
          console.error('Failed to delete conversation:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to delete conversation',
            loading: false 
          });
          throw error;
        }
      },

      updateConversation: async (projectId: number, sessionId: string, data: { name: string }) => {
        set({ loading: true, error: null });
        
        try {
          const client = getClient();
          const response = await client.updateConversation(projectId, sessionId, data);
          const updatedConversation = response.data;
          
          set(state => ({ 
            allConversations: state.allConversations.map(c => 
              c.session_id === sessionId ? updatedConversation : c
            ),
            currentConversation: state.currentConversation?.session_id === sessionId 
              ? updatedConversation 
              : state.currentConversation,
            loading: false,
          }));
          
          // Apply client-side filters
          get().applyFilters();
        } catch (error) {
          console.error('Failed to update conversation:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to update conversation',
            loading: false 
          });
          throw error;
        }
      },

      // Auto-create conversation if none exists
      ensureConversation: async (projectId: number, firstMessage?: string) => {
        const { currentConversation } = get();
        
        // If we have a current conversation for this project, use it
        if (currentConversation && currentConversation.project_id === projectId) {
          return currentConversation;
        }
        
        // If no current conversation, always create a new one
        // This ensures that seeing the welcome screen (currentConversation = null) 
        // always results in starting a fresh conversation
        const name = firstMessage 
          ? generateConversationName(firstMessage)
          : `Chat ${new Date().toLocaleDateString()}`;
          
        await get().createConversation(projectId, name);
        return get().currentConversation!;
      },
    }),
    {
      name: `customgpt-conversations-${getSessionId()}`,
      partialize: (state) => ({
        conversations: state.conversations,
        allConversations: state.allConversations,
        searchQuery: state.searchQuery,
        searchMode: state.searchMode,
        dateFilter: state.dateFilter,
        // Don't persist currentConversation to always start fresh
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ensure conversations is an array
          if (!Array.isArray(state.conversations)) {
            state.conversations = [];
          }
          
          // Ensure allConversations is an array
          if (!Array.isArray(state.allConversations)) {
            state.allConversations = [];
          }
          
          // Ensure filter state is initialized
          if (!state.searchQuery) state.searchQuery = '';
          if (!state.searchMode) state.searchMode = 'name';
          if (!state.dateFilter) state.dateFilter = 'all';
          
          // Clear current conversation on fresh app load to start with welcome screen
          state.currentConversation = null;
        }
      },
    }
  )
);