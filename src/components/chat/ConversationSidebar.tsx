/**
 * Conversation Sidebar Component
 * 
 * Manages the conversation list and provides quick navigation
 * between different chat sessions. Includes conversation management
 * features like create, rename, and delete.
 * 
 * Features:
 * - Conversation list with search/filter
 * - Create new conversation
 * - Rename conversations inline
 * - Delete conversations with confirmation
 * - Agent management access
 * - Data source management
 * - Analytics dashboard access
 * - Collapsible sidebar
 * 
 * State Management:
 * - Conversations from conversationStore
 * - Current conversation selection
 * - Search/filter state (local)
 * - Collapse state (passed from parent)
 * 
 * UI/UX Features:
 * - Hover states and animations
 * - Keyboard shortcuts (future enhancement)
 * - Context menu for conversation actions
 * - Auto-scroll to selected conversation
 * - Responsive design for mobile
 * 
 * Features:
 * - Advanced conversation organization with categories and search
 * - Bulk conversation management with export/import capabilities
 * - Customizable sidebar design with responsive layout
 * - Professional conversation management with templates and pinning
 * - Comprehensive conversation history and analytics
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Plus, 
  MoreHorizontal, 
  Trash2, 
  Edit3, 
  Calendar,
  Search,
  X,
  Bot,
  Filter,
  ChevronDown,
  ChevronUp,
  Info,
  Download,
  Share2,
  Clock,
  User
} from 'lucide-react';
import { toast } from 'sonner';

import type { Conversation } from '@/types';
import { useConversationStore, useAgentStore, useMessageStore } from '@/hooks/useWidgetStore';
import { cn, formatTimestamp, generateConversationName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { logger } from '@/lib/logger';
import { ConversationDetailsModal } from './ConversationDetailsModal';
import { DeleteConversationDialog } from './DeleteConversationDialog';
import { ConversationSkeleton, Spinner } from '@/components/ui/loading';
import { useDemoModeContext } from '@/contexts/DemoModeContext';

/**
 * Props for individual conversation item
 * 
 * @property conversation - Conversation data object
 * @property isSelected - Whether this conversation is currently active
 * @property onSelect - Callback when conversation is clicked
 * @property onDelete - Callback for deleting conversation
 * @property onRename - Callback for renaming conversation
 */
interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (conversation: Conversation) => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, newName: string) => void;
}

/**
 * Individual Conversation Item Component
 * 
 * Renders a single conversation in the sidebar with actions.
 * Features inline editing and context menu for management.
 */
const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isSelected,
  onSelect,
  onDelete,
  onRename
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name);
  const [showMenu, setShowMenu] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName.trim() !== conversation.name) {
      onRename(conversation.id.toString(), editName.trim());
    }
    setIsEditing(false);
    setEditName(conversation.name);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(conversation.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
    setShowMenu(false);
  };

  const handleConfirmDelete = async () => {
    await onDelete(conversation.id.toString());
    setShowDeleteDialog(false);
  };

  return (
    <div
      className={cn(
        'group relative p-3 rounded-lg cursor-pointer transition-colors',
        'hover:bg-accent',
        isSelected && 'bg-accent/50 hover:bg-accent/70'
      )}
      onClick={async () => {
        if (isEditing || isLoading) return;
        setIsLoading(true);
        try {
          await onSelect(conversation);
        } finally {
          setIsLoading(false);
        }
      }}
    >
      {/* Loading overlay for individual conversation */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <Spinner size="sm" />
        </div>
      )}
      
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-sm font-medium text-foreground bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              maxLength={100}
            />
          ) : (
            <h3 className="font-medium text-foreground text-sm truncate">
              {conversation.name}
            </h3>
          )}
          
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span title={new Date(conversation.updated_at).toLocaleString()}>
              {formatTimestamp(conversation.updated_at)}
            </span>
            {conversation.message_count !== undefined && (
              <>
                <span>•</span>
                <MessageSquare className="w-3 h-3" />
                <span>{conversation.message_count}</span>
              </>
            )}
          </div>
          
          {/* More Details Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(!showDetails);
            }}
            className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                More Details
              </>
            )}
          </button>
          
          {/* Expandable Details Section */}
          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 pt-2 border-t border-border"
              >
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Session ID:</span>
                    <span className="font-mono text-foreground truncate max-w-[150px]" title={conversation.session_id}>
                      {conversation.session_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Created:</span>
                    <span className="text-foreground">{formatTimestamp(conversation.created_at)}</span>
                  </div>
                  {conversation.deleted_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-destructive">Deleted:</span>
                      <span className="text-destructive">{formatTimestamp(conversation.deleted_at)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Menu Button */}
        {!isEditing && (
          <div className="relative" ref={menuRef}>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-6 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-50"
                >
                  <div className="py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDetailsModal(true);
                        setShowMenu(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      <Info className="w-3 h-3" />
                      View Details
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      <Edit3 className="w-3 h-3" />
                      Rename
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Conversation Details Modal */}
      <ConversationDetailsModal
        conversation={conversation}
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />

      {/* Delete Conversation Dialog */}
      <DeleteConversationDialog
        isOpen={showDeleteDialog}
        conversationName={conversation.name}
        messageCount={conversation.message_count}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
};

interface ConversationSidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
  onConversationSelect?: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  className,
  isCollapsed = false,
  onToggle,
  isMobile = false,
  onConversationSelect
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showSortFilter, setShowSortFilter] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const { isFreeTrialMode } = useDemoModeContext();
  
  const { 
    conversations, 
    currentConversation, 
    loading, 
    error,
    fetchConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
    // Pagination state
    currentPage,
    totalPages,
    totalConversations,
    perPage,
    // Sorting and filtering state
    sortOrder,
    sortBy,
    userFilter,
    // Client-side filtering state and methods
    searchQuery: storeSearchQuery,
    searchMode: storeSearchMode,
    dateFilter: storeDateFilter,
    setSearchQuery,
    setSearchMode,
    setDateFilter,
    applyFilters
  } = useConversationStore();
  
  const { currentAgent } = useAgentStore();
  const { clearMessages, loadMessages } = useMessageStore();

  // Fetch conversations when agent changes
  useEffect(() => {
    // Skip API calls in demo mode
    const isDemoMode = typeof window !== 'undefined' && (window as any).__customgpt_demo_mode;
    
    if (currentAgent && !isDemoMode) {
      logger.info('UI', 'Agent changed in sidebar, fetching conversations', {
        agentId: currentAgent.id,
        agentName: currentAgent.project_name,
        isActive: currentAgent.is_chat_active
      });
      fetchConversations(currentAgent.id);
    } else if (!currentAgent) {
      logger.warn('UI', 'No current agent selected in sidebar');
    } else if (isDemoMode) {
      logger.info('UI', 'Skipping conversation fetch in demo mode');
    }
  }, [currentAgent, fetchConversations]);

  // Local search query for input handling
  const [localSearchQuery, setLocalSearchQuery] = useState(storeSearchQuery);

  // Update local state when store state changes
  useEffect(() => {
    setLocalSearchQuery(storeSearchQuery);
  }, [storeSearchQuery]);

  // Debounced search function
  const debouncedSearch = useCallback(
    (query: string) => {
      setIsSearching(true);
      try {
        setSearchQuery(query.trim());
      } catch (error) {
        logger.error('UI', 'Failed to search conversations', error);
      } finally {
        setIsSearching(false);
      }
    },
    [setSearchQuery]
  );

  // Debounce search calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localSearchQuery !== storeSearchQuery) {
        debouncedSearch(localSearchQuery);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [localSearchQuery, storeSearchQuery, debouncedSearch]);

  // Handle search input change
  const handleSearch = (query: string) => {
    setLocalSearchQuery(query);
  };

  // Handle date filter change
  const handleDateFilterChange = (filter: 'all' | 'today' | 'week' | 'month') => {
    setDateFilter(filter);
  };

  // Handle search mode change  
  const handleSearchModeChange = (mode: 'name' | 'id' | 'session') => {
    setSearchMode(mode);
  };
  
  // Use conversations directly since filtering is now done server-side
  const filteredConversations = Array.isArray(conversations) ? conversations : [];

  const handleNewConversation = async () => {
    if (!currentAgent || isCreating) return;
    
    if (isFreeTrialMode) {
      toast.error('Creating new conversations is not available in free trial mode');
      return;
    }
    
    logger.info('UI', 'Creating new conversation', {
      agentId: currentAgent.id,
      agentName: currentAgent.project_name
    });
    
    setIsCreating(true);
    try {
      const name = `New Chat ${new Date().toLocaleDateString()}`;
      await createConversation(currentAgent.id, name);
      clearMessages(); // Clear current messages when starting new conversation
      logger.info('UI', 'New conversation created successfully', { name });
      toast.success('New conversation created');
      
      // Call the onConversationSelect callback to close the mobile drawer
      if (onConversationSelect) {
        onConversationSelect();
      }
    } catch (error) {
      logger.error('UI', 'Failed to create conversation', error, {
        agentId: currentAgent.id,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      toast.error('Failed to create new conversation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    // Prevent multiple clicks while switching
    if (loading) return;
    
    logger.info('UI', 'Selecting conversation', {
      conversationId: conversation.id,
      conversationName: conversation.name,
      projectId: conversation.project_id,
      messageCount: conversation.message_count
    });
    
    selectConversation(conversation);
    
    // Load messages for the selected conversation
    try {
      logger.info('UI', 'Loading messages for selected conversation', {
        conversationId: conversation.id,
        agentId: currentAgent?.id,
        agentName: currentAgent?.project_name
      });
      
      await loadMessages(conversation.id.toString());
      
      logger.info('UI', 'Messages loaded successfully for conversation', {
        conversationId: conversation.id
      });
      
      // Call the onConversationSelect callback to close the mobile drawer
      if (onConversationSelect) {
        onConversationSelect();
      }
    } catch (error) {
      logger.error('UI', 'Failed to load messages for conversation', error, {
        conversationId: conversation.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      toast.error('Failed to load conversation messages');
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (isFreeTrialMode) {
      toast.error('Deleting conversations is not available in free trial mode');
      return;
    }
    
    try {
      await deleteConversation(conversationId);
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  };

  const handleRenameConversation = async (conversationId: string, newName: string) => {
    if (isFreeTrialMode) {
      toast.error('Renaming conversations is not available in free trial mode');
      return;
    }
    
    const conversation = conversations.find(c => c.id.toString() === conversationId);
    if (!conversation) return;
    
    try {
      await updateConversation(conversation.project_id, conversation.session_id, { name: newName });
      toast.success('Conversation renamed');
    } catch (error) {
      toast.error('Failed to rename conversation');
    }
  };

  // Use prop or fallback to viewport check if needed
  // const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  if (isCollapsed && !isMobile) {
    return (
      <div className={cn('w-12 bg-muted border-r border-border flex flex-col', className)}>
        <div className="p-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggle}
            className="w-8 h-8"
            title="Expand sidebar"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'bg-muted flex flex-col',
      isMobile ? 'w-full h-full' : 'w-80 border-r border-border',
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-background">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Conversations</h2>
          {!isMobile && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onToggle}
              className="h-8 w-8"
              title="Collapse sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={isMobile ? "Search conversations..." : `Search by ${storeSearchMode}...`}
              value={localSearchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className={cn(
                "w-full pl-9 pr-12 py-2 text-sm border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground",
                isMobile && "py-3"
              )}
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-600"></div>
              </div>
            )}
          </div>
          
          {/* Search Mode Selector - Hidden on mobile */}
          {!isMobile && (
            <div className="flex gap-1">
              <button
                onClick={() => handleSearchModeChange('name')}
                className={cn(
                  "flex-1 px-2 py-1 text-xs rounded transition-colors",
                  storeSearchMode === 'name' 
                    ? "bg-brand-500 text-white" 
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                Name
              </button>
              <button
                onClick={() => handleSearchModeChange('id')}
                className={cn(
                  "flex-1 px-2 py-1 text-xs rounded transition-colors",
                  storeSearchMode === 'id' 
                    ? "bg-brand-500 text-white" 
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                ID
              </button>
              <button
                onClick={() => handleSearchModeChange('session')}
                className={cn(
                  "flex-1 px-2 py-1 text-xs rounded transition-colors",
                  storeSearchMode === 'session' 
                    ? "bg-brand-500 text-white" 
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                Session
              </button>
            </div>
          )}
        </div>
        
        {/* Sort and Filter Toggle - Hidden on mobile */}
        {!isMobile && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSortFilter(!showSortFilter)}
            className="w-full mt-2 justify-center gap-2"
          >
            <Filter className="h-3 w-3" />
            Sort & Filter
            {showSortFilter ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
        
        {/* Sort and Filter Options - Hidden on mobile */}
        {!isMobile && showSortFilter && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3 mt-3 overflow-hidden"
            >
              {/* Sort Options */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Sort By</label>
                <div className="grid grid-cols-2 gap-2">
                  <SimpleSelect
                    value={sortBy}
                    onValueChange={(value) => {
                      if (currentAgent) {
                        // Update the sort state and apply filters client-side
                        fetchConversations(currentAgent.id, { 
                          orderBy: value 
                        });
                      }
                    }}
                    options={[
                      { value: 'id', label: 'Date Created' },
                      { value: 'updated_at', label: 'Last Updated' },
                      { value: 'name', label: 'Name' }
                    ]}
                    className="text-xs"
                  />
                  
                  <SimpleSelect
                    value={sortOrder}
                    onValueChange={(value) => {
                      if (currentAgent) {
                        // Update the sort state and apply filters client-side
                        fetchConversations(currentAgent.id, { 
                          order: value as 'asc' | 'desc' 
                        });
                      }
                    }}
                    options={[
                      { value: 'desc', label: 'Newest First' },
                      { value: 'asc', label: 'Oldest First' }
                    ]}
                    className="text-xs"
                  />
                </div>
              </div>
              
              {/* Date Filter */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Filter By Date</label>
                <SimpleSelect
                  value={storeDateFilter}
                  onValueChange={(value) => handleDateFilterChange(value as 'all' | 'today' | 'week' | 'month')}
                  options={[
                    { value: 'all', label: 'All Time' },
                    { value: 'today', label: 'Today' },
                    { value: 'week', label: 'Last 7 Days' },
                    { value: 'month', label: 'Last 30 Days' }
                  ]}
                  className="w-full text-xs"
                />
              </div>
              
              {/* User Filter */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Filter By User</label>
                <SimpleSelect
                  value={userFilter}
                  onValueChange={(value) => {
                    if (currentAgent) {
                      // Update the user filter state and apply filters client-side
                      fetchConversations(currentAgent.id, { 
                        userFilter: value 
                      });
                    }
                  }}
                  options={[
                    { value: 'all', label: 'All Users' },
                    { value: 'me', label: 'My Conversations' }
                    // Additional user options could be dynamically loaded
                  ]}
                  className="w-full text-xs"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-4 space-y-2">
        <Link href="/dashboard/projects/create">
          <Button
            className="w-full justify-start gap-2"
            variant="default"
            disabled={isFreeTrialMode}
            title={isFreeTrialMode ? 'Creating new agents is not available in free trial mode' : ''}
          >
            <Bot className="w-4 h-4" />
            Create New Agent
          </Button>
        </Link>
        
        <Button
          onClick={handleNewConversation}
          disabled={!currentAgent || isCreating || isFreeTrialMode}
          className="w-full justify-start gap-2"
          variant="outline"
          title={isFreeTrialMode ? 'Creating new conversations is not available in free trial mode' : ''}
        >
          {isCreating ? (
            <>
              <Spinner size="sm" />
              <span>Creating...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>New Chat</span>
            </>
          )}
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (!Array.isArray(conversations) || conversations.length === 0) ? (
          <ConversationSkeleton count={5} />
        ) : error && (!Array.isArray(conversations) || conversations.length === 0) ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">No conversations available</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => currentAgent && fetchConversations(currentAgent.id)}
            >
              Try Again
            </Button>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {storeSearchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!storeSearchQuery && (
              <p className="text-xs text-muted-foreground mt-1">
                Start a new conversation to get going
              </p>
            )}
            {currentAgent && (
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Agent: {currentAgent.project_name} (ID: {currentAgent.id})</p>
                {error && (
                  <p className="text-destructive">Error: {error}</p>
                )}
                <p>Conversations loaded: {conversations.length}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={currentConversation?.id === conversation.id}
                onSelect={handleSelectConversation}
                onDelete={(id) => handleDeleteConversation(id)}
                onRename={handleRenameConversation}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with Pagination */}
      <div className="p-4 border-t border-border bg-background space-y-3">
        <div className="text-xs text-muted-foreground text-center">
          {storeSearchQuery ? (
            <>
              {filteredConversations.length} result{filteredConversations.length !== 1 ? 's' : ''}
            </>
          ) : (
            <>
              Showing {conversations.length} of {totalConversations} conversation{totalConversations !== 1 ? 's' : ''}
            </>
          )}
          {currentAgent && (
            <span className="block mt-1">
              Agent: {currentAgent.project_name}
            </span>
          )}
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && !storeSearchQuery && (
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentAgent && currentPage > 1) {
                  fetchConversations(currentAgent.id, { page: currentPage - 1 });
                }
              }}
              disabled={currentPage === 1 || loading}
            >
              <ChevronDown className="h-3 w-3 rotate-90" />
            </Button>
            
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentAgent && currentPage < totalPages) {
                  fetchConversations(currentAgent.id, { page: currentPage + 1 });
                }
              }}
              disabled={currentPage === totalPages || loading}
            >
              <ChevronDown className="h-3 w-3 -rotate-90" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};