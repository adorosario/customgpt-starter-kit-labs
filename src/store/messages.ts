/**
 * Message Store - Core Chat Functionality
 * 
 * This store manages all message-related state and operations.
 * It's the heart of the chat system, handling:
 * - Message sending and receiving
 * - Real-time streaming responses
 * - Message history management
 * - Local storage fallback
 * - Error handling and retries
 * 
 * Architecture:
 * - Uses Map for efficient conversation-based message storage
 * - Integrates with agent and conversation stores
 * - Handles both streaming and non-streaming API responses
 * - Provides local storage backup for offline access
 * 
 * Key Features:
 * - Automatic conversation creation if needed
 * - Streaming with fallback to non-streaming
 * - Optimistic UI updates
 * - Message feedback tracking
 * - File upload support
 * 
 * Features:
 * - Real-time streaming with local storage persistence
 * - Robust error handling with graceful fallbacks
 * - Comprehensive logging and debugging support
 * - Optimistic UI updates with consistent message ordering
 */

import { create } from 'zustand';
import type { MessageStore, ChatMessage, Citation, FeedbackType, MessageDetails, MessageMetadata } from '@/types';
import { getClient } from '@/lib/api/client';
import { useAgentStore } from './agents';
import { useConversationStore } from './conversations';
import { useChatSettingsStore } from './chat-settings';
import { generateId } from '@/lib/utils';
import { globalStreamManager } from '@/lib/streaming/handler';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

/**
 * Remove citation references from content
 * Removes patterns like :cit[xxx/xxx] from the message text
 */
function removeCitationReferences(content: string): string {
  // Remove citation references and any extra spaces they might leave
  return content.replace(/\s*:cit\[\d+\/\d+\]\s*/g, ' ').trim();
}

/**
 * Local storage configuration
 * Provides offline access and caching for better UX
 */
const MESSAGES_STORAGE_KEY = 'customgpt-messages-cache';

/**
 * Save messages to local storage
 * Provides a fallback when API is unavailable
 * @param conversationId - The conversation to save messages for
 * @param messages - Array of messages to save
 */
function saveMessagesToStorage(conversationId: string, messages: ChatMessage[]) {
  try {
    const stored = localStorage.getItem(MESSAGES_STORAGE_KEY);
    const cache = stored ? JSON.parse(stored) : {};
    cache[conversationId] = messages;
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Silent fail - storage is optional
  }
}

/**
 * Load messages from local storage
 * Used as fallback when API is unavailable
 * @param conversationId - The conversation to load messages for
 * @returns Array of messages or null if not found
 */
function loadMessagesFromStorage(conversationId: string): ChatMessage[] | null {
  try {
    const stored = localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored);
    return cache[conversationId] || null;
  } catch (error) {
    // Silent fail - storage is optional
    return null;
  }
}

/**
 * Fetch citation details by IDs
 * 
 * Converts citation IDs to full citation objects with title, source, content
 * 
 * @param citationIds - Array of citation IDs
 * @param projectId - The project/agent ID
 * @returns Array of citation objects with details
 */
/**
 * Validate and filter citation IDs
 * 
 * @param citationIds - Raw citation IDs from API
 * @returns Filtered array of valid citation IDs
 */
function validateCitationIds(citationIds: any[]): number[] {
  if (!Array.isArray(citationIds)) {
    logger.warn('MESSAGES', 'Citation IDs is not an array', { citationIds });
    return [];
  }
  
  const validIds = citationIds
    .filter(id => typeof id === 'number' && !isNaN(id) && id > 0)
    .filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates
  
  if (validIds.length !== citationIds.length) {
    logger.warn('MESSAGES', 'Filtered out invalid citation IDs', {
      original: citationIds,
      valid: validIds,
      filtered: citationIds.length - validIds.length
    });
  }
  
  return validIds;
}

async function fetchCitationDetails(citationIds: number[], projectId: number): Promise<Citation[]> {
  // Validate input citation IDs
  const validCitationIds = validateCitationIds(citationIds);
  
  if (validCitationIds.length === 0) {
    logger.warn('MESSAGES', 'No valid citation IDs to fetch', { citationIds });
    return [];
  }
  
  logger.info('MESSAGES', 'Fetching citation details', {
    projectId,
    citationIds: validCitationIds,
    count: validCitationIds.length
  });
  
  const client = getClient();
  const citations: Citation[] = [];
  
  for (let i = 0; i < validCitationIds.length; i++) {
    const citationId = validCitationIds[i];
    
    try {
      const response = await client.getCitation(projectId, citationId);
      
      if (response.data) {
        const citation = {
          id: citationId.toString(), // Convert to string as per Citation interface
          index: i + 1, // 1-based index for display
          title: response.data.title || `Citation ${i + 1}`,
          source: response.data.url,
          url: response.data.url,
          content: response.data.description || '',
        };
        citations.push(citation);
        
        logger.info('MESSAGES', 'Citation fetched successfully', {
          citationId,
          title: citation.title,
          hasContent: !!citation.content,
          hasUrl: !!citation.url
        });
      } else {
        logger.warn('MESSAGES', 'Citation API returned empty data', {
          citationId,
          response
        });
      }
    } catch (error) {
      logger.warn('MESSAGES', 'Failed to fetch citation details', {
        citationId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      // Only create fallback citations for actual errors, not empty responses
      // This reduces wrong citations from appearing
      if (error instanceof Error && error.message.includes('404')) {
        logger.info('MESSAGES', 'Citation not found, skipping fallback', { citationId });
        // Skip creating fallback for 404 errors - citation simply doesn't exist
        continue;
      } else {
        // Create fallback only for network/server errors
        citations.push({
          id: citationId.toString(), // Convert to string
          index: i + 1,
          title: `Citation ${i + 1}`,
          source: '',
          url: '',
          content: 'Citation details unavailable',
        });
      }
    }
  }
  
  logger.info('MESSAGES', 'Citation fetching completed', {
    requested: validCitationIds.length,
    fetched: citations.length,
    success: citations.filter(c => c.content !== 'Citation details unavailable').length
  });
  
  return citations;
}

/**
 * Message Store Implementation
 * 
 * State Structure:
 * - messages: Map<conversationId, ChatMessage[]> - All messages grouped by conversation
 * - streamingMessage: Current message being streamed (null when not streaming)
 * - isStreaming: Whether a message is currently being streamed
 * - loading: General loading state for message operations
 * - error: Current error message if any
 */
export const useMessageStore = create<MessageStore>((set, get) => ({
  // Initialize with empty state
  messages: new Map(),
  streamingMessage: null,
  isStreaming: false,
  loading: false,
  error: null,

  /**
   * Send a message to the current agent
   * 
   * Flow:
   * 1. Validate agent selection
   * 2. Ensure conversation exists (create if needed)
   * 3. Create and add user message (optimistic update)
   * 4. Upload files if present
   * 5. Start streaming response
   * 6. Fall back to non-streaming if streaming fails
   * 7. Handle errors gracefully
   * 
   * 
   * @param content - Message text
   * @param files - Optional file attachments
   */
  sendMessage: async (content: string, files?: File[]) => {
    // Skip API calls in demo mode
    const isDemoMode = typeof window !== 'undefined' && (window as any).__customgpt_demo_mode;
    
    const agentStore = useAgentStore.getState();
    const conversationStore = useConversationStore.getState();
    
    const { currentAgent } = agentStore;
    if (!currentAgent) {
      logger.error('MESSAGES', 'No agent selected when trying to send message');
      
      // Check if this is due to missing API keys
      const response = await fetch('/api/proxy/user/limits').catch(() => null);
      if (!response || response.status === 401 || response.status === 500) {
        throw new Error('API key not configured. Please add CUSTOMGPT_API_KEY to your .env.local file and restart the server.');
      }
      
      throw new Error('No agent selected. Please select or create an agent first.');
    }

    logger.info('MESSAGES', 'Sending message', {
      agentId: currentAgent.id,
      agentName: currentAgent.project_name,
      messageLength: content.length,
      hasFiles: files && files.length > 0
    });

    // Ensure we have a conversation
    const conversation = await conversationStore.ensureConversation(
      currentAgent.id,
      content
    );

    logger.info('MESSAGES', 'Conversation ensured', {
      conversationId: conversation.id,
      sessionId: conversation.session_id,
      hasSessionId: !!conversation.session_id,
      isNew: !conversation.message_count || conversation.message_count === 0
    });

    if (!conversation.session_id) {
      logger.error('MESSAGES', 'Conversation missing session_id', { conversation });
      throw new Error('Conversation missing session_id');
    }

    set({ loading: true, error: null });

    // Create user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    // Add user message to store
    get().addMessage(conversation.id.toString(), userMessage);

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      citations: [],
    };

    set({ 
      streamingMessage: assistantMessage,
      isStreaming: true,
      loading: false,
    });

    try {
      // Handle file uploads if present
      let sourceIds: string[] = [];
      if (files && files.length > 0) {
        const client = getClient();
        const uploadResponses = await Promise.all(
          files.map(file => client.uploadFile(currentAgent.id, file))
        );
        
        // Extract source IDs from upload responses
        sourceIds = uploadResponses
          .filter(response => response?.data?.id)
          .map(response => response.data.id.toString());
          
        logger.info('MESSAGES', 'Files uploaded successfully', {
          fileCount: files.length,
          sourceIds: sourceIds
        });
      }

      // Update user message status
      userMessage.status = 'sent';
      get().addMessage(conversation.id.toString(), userMessage);

      // Start streaming with correct parameters
      const client = getClient();
      
      logger.info('MESSAGES', 'Starting message stream', {
        agentId: currentAgent.id,
        sessionId: conversation.session_id,
        messageContent: content.substring(0, 50),
        hasSourceIds: sourceIds.length > 0,
        sourceIds: sourceIds
      });
      
      try {
        // Get chat settings for current agent
        const chatSettings = useChatSettingsStore.getState().getSettings(currentAgent.id);
        
        // Prepare the request data - only send fields that the API accepts
        const requestData: { 
          prompt: string; 
          source_ids?: string[];
          response_source?: string;
        } = { 
          prompt: content || '', // Ensure we always have a prompt, even if empty
          response_source: chatSettings.response_source || 'default',
        };
        
        // Add source_ids if we have uploaded files
        if (sourceIds.length > 0) {
          requestData.source_ids = sourceIds;
          
          // If no text prompt was provided, add a default prompt for file analysis
          if (!content.trim()) {
            requestData.prompt = 'Please analyze the uploaded file(s).';
          }
        }
        
        await client.sendMessageStream(
          currentAgent.id,
          conversation.session_id,  // Use session_id instead of id
          requestData,
          (chunk) => {
              logger.info('MESSAGES', 'Received stream chunk', { 
                type: chunk.type, 
                hasContent: !!chunk.content,
                contentLength: chunk.content?.length,
                contentPreview: chunk.content?.substring(0, 50)
              });
              
              if (chunk.type === 'content' && chunk.content) {
                get().updateStreamingMessage(chunk.content, chunk.citations);
              } else if (chunk.type === 'citation' && chunk.citations) {
                // Handle citation-only chunks
                const current = get().streamingMessage;
                if (current && chunk.citations && Array.isArray(chunk.citations)) {
                  // Check if citations are IDs or objects
                  if (chunk.citations.length > 0 && typeof chunk.citations[0] === 'number') {
                    // Fetch citation details asynchronously
                    fetchCitationDetails(chunk.citations as any as number[], currentAgent.id).then(citationDetails => {
                      const updatedCurrent = get().streamingMessage;
                      if (updatedCurrent) {
                        set({
                          streamingMessage: {
                            ...updatedCurrent,
                            citations: citationDetails
                          }
                        });
                      }
                    });
                  } else {
                    // Citations might already be objects
                    set({
                      streamingMessage: {
                        ...current,
                        citations: chunk.citations
                      }
                    });
                  }
                }
              }
            },
            async (streamError) => {
              logger.error('MESSAGES', 'Streaming failed, attempting fallback to non-streaming', streamError, {
                errorMessage: streamError.message,
                agentId: currentAgent.id,
                sessionId: conversation.session_id
              });
              
              // Try fallback to non-streaming API
              try {
                logger.info('MESSAGES', 'Using non-streaming fallback');
                
                const response = await client.sendMessage(
                  currentAgent.id,
                  conversation.session_id,
                  { 
                    prompt: requestData.prompt,
                    stream: false,
                    source_ids: requestData.source_ids
                  }
                );
                
                // Update streaming message with the complete response
                const finalMessage = get().streamingMessage;
                if (finalMessage && response) {
                  // Handle different response formats from API
                  let messageData: any;
                  if (response.data) {
                    messageData = response.data;
                  } else {
                    // Direct response format - cast to any to handle the actual API structure
                    messageData = response as any;
                  }
                  
                  // Clean citation references from the response content
                  const rawContent = messageData?.openai_response || messageData?.content || 'No response received';
                  finalMessage.content = removeCitationReferences(rawContent);
                  
                  // Fetch citation details if needed
                  if (messageData?.citations && Array.isArray(messageData.citations) && messageData.citations.length > 0) {
                    if (typeof messageData.citations[0] === 'number') {
                      // Citations are IDs, fetch details
                      finalMessage.citations = await fetchCitationDetails(messageData.citations, currentAgent.id);
                    } else {
                      // Citations might already be objects
                      finalMessage.citations = messageData.citations;
                    }
                  } else {
                    finalMessage.citations = [];
                  }
                  
                  finalMessage.status = 'sent';
                  
                  // Update the message ID to include the prompt ID if available
                  if (messageData?.id) {
                    finalMessage.id = `${messageData.id}-assistant`;
                    // Also update the user message ID
                    const conversationMessages = get().messages.get(conversation.id.toString()) || [];
                    const lastUserMessage = conversationMessages.filter(m => m.role === 'user').pop();
                    if (lastUserMessage && lastUserMessage.id === userMessage.id) {
                      lastUserMessage.id = `${messageData.id}-user`;
                      get().addMessage(conversation.id.toString(), lastUserMessage);
                    }
                  }
                  
                  // Add details from the API response
                  finalMessage.details = {
                    user_id: messageData?.user_id,
                    conversation_id: messageData?.conversation_id,
                    updated_at: messageData?.updated_at,
                    prompt_id: messageData?.id,
                    metadata: messageData?.metadata ? {
                      user_ip: messageData.metadata.user_ip,
                      user_agent: messageData.metadata.user_agent,
                      external_id: messageData.metadata.external_id,
                      request_source: messageData.metadata.request_source,
                    } : undefined,
                  };
                  get().addMessage(conversation.id.toString(), finalMessage);
                }
                
                set({ 
                  streamingMessage: null,
                  isStreaming: false,
                });
                
                logger.info('MESSAGES', 'Fallback to non-streaming successful');
                
              } catch (fallbackError: any) {
                logger.error('MESSAGES', 'Both streaming and non-streaming failed', fallbackError);
                
                // Update assistant message with error
                const errorMessage = get().streamingMessage;
                if (errorMessage) {
                  errorMessage.content = 'Sorry, I encountered an error while processing your message. Please try again.';
                  errorMessage.status = 'error';
                  get().addMessage(conversation.id.toString(), errorMessage);
                }
                
                // Extract error details including status code
                let errorText = 'Communication error';
                if (fallbackError.status) {
                  switch (fallbackError.status) {
                    case 429:
                      errorText = 'You have exhausted your current query credits. Please contact customer service for assistance.';
                      break;
                    case 401:
                      errorText = 'API Token is either missing or invalid';
                      break;
                    case 404:
                      errorText = 'Agent or conversation not found';
                      break;
                    case 400:
                      errorText = 'Invalid request format';
                      break;
                    default:
                      errorText = fallbackError.message || `Error ${fallbackError.status}`;
                  }
                } else if (fallbackError.message) {
                  errorText = fallbackError.message;
                }
                
                set({ 
                  streamingMessage: null,
                  isStreaming: false,
                  error: errorText,
                });
              }
            },
            async () => {
              // onComplete callback - enrich streaming message with API data
              const finalMessage = get().streamingMessage;
              if (finalMessage) {
                finalMessage.status = 'sent';
                
                // Clean citation references from the final message content
                finalMessage.content = removeCitationReferences(finalMessage.content);
                
                // Clear streaming state FIRST to prevent duplication
                set({ 
                  streamingMessage: null,
                  isStreaming: false,
                });
                
                // Then add message to ensure it's visible
                get().addMessage(conversation.id.toString(), finalMessage);
                
                // Fetch latest messages to enrich the streaming message with API metadata
                try {
                  logger.info('MESSAGES', 'Enriching streaming message with API data');
                  const client = getClient();
                  const response = await client.getMessages(currentAgent.id, conversation.session_id);
                  
                  // Process API response to find messages
                  let apiMessages = [];
                  if (response && typeof response === 'object') {
                    if ((response as any).data && (response as any).data.messages && Array.isArray((response as any).data.messages.data)) {
                      apiMessages = (response as any).data.messages.data;
                    } else if (Array.isArray((response as any).data)) {
                      apiMessages = (response as any).data;
                    } else if (Array.isArray(response)) {
                      apiMessages = response;
                    } else if ((response as any).data && Array.isArray((response as any).data.data)) {
                      apiMessages = (response as any).data.data;
                    }
                  }
                  
                  if (apiMessages.length > 0) {
                    // Find the most recent assistant message (should be our streaming message)
                    const latestApiMessage = apiMessages[apiMessages.length - 1];
                    
                    if (latestApiMessage && latestApiMessage.openai_response) {
                      // Enrich the streaming message with API data
                      finalMessage.id = `${latestApiMessage.id}-assistant`;
                      finalMessage.timestamp = latestApiMessage.created_at || latestApiMessage.timestamp || finalMessage.timestamp;
                      
                      // Add full message details
                      finalMessage.details = {
                        user_id: latestApiMessage.user_id,
                        conversation_id: latestApiMessage.conversation_id,
                        updated_at: latestApiMessage.updated_at,
                        prompt_id: latestApiMessage.id,
                        metadata: latestApiMessage.metadata ? {
                          user_ip: latestApiMessage.metadata.user_ip,
                          user_agent: latestApiMessage.metadata.user_agent,
                          external_id: latestApiMessage.metadata.external_id,
                          request_source: latestApiMessage.metadata.request_source,
                        } : undefined,
                      };
                      
                      // Also enrich the user message with proper ID and details
                      const conversationMessages = get().messages.get(conversation.id.toString()) || [];
                      const lastUserMessage = conversationMessages.filter(m => m.role === 'user').pop();
                      if (lastUserMessage && lastUserMessage.id === userMessage.id && latestApiMessage.user_query) {
                        lastUserMessage.id = `${latestApiMessage.id}-user`;
                        lastUserMessage.timestamp = latestApiMessage.created_at || latestApiMessage.timestamp || lastUserMessage.timestamp;
                        lastUserMessage.details = {
                          user_id: latestApiMessage.user_id,
                          conversation_id: latestApiMessage.conversation_id,
                          updated_at: latestApiMessage.updated_at,
                          prompt_id: latestApiMessage.id,
                          metadata: latestApiMessage.metadata ? {
                            user_ip: latestApiMessage.metadata.user_ip,
                            user_agent: latestApiMessage.metadata.user_agent,
                            external_id: latestApiMessage.metadata.external_id,
                            request_source: latestApiMessage.metadata.request_source,
                          } : undefined,
                        };
                        get().addMessage(conversation.id.toString(), lastUserMessage);
                      }
                      
                      // Enrich citations if they exist
                      // Preserve existing citations from streaming if API doesn't provide them
                      const existingCitations = finalMessage.citations || [];
                      
                      if (latestApiMessage.citations && Array.isArray(latestApiMessage.citations) && latestApiMessage.citations.length > 0) {
                        if (typeof latestApiMessage.citations[0] === 'number') {
                          // Citations are IDs, fetch details
                          const citationDetails = await fetchCitationDetails(latestApiMessage.citations, currentAgent.id);
                          finalMessage.citations = citationDetails;
                        } else {
                          // Citations might already be objects
                          finalMessage.citations = latestApiMessage.citations;
                        }
                      } else {
                        // Keep existing citations from streaming if API doesn't provide any
                        finalMessage.citations = existingCitations;
                      }
                      
                      // Update feedback if present
                      if (latestApiMessage.response_feedback?.reaction) {
                        finalMessage.feedback = latestApiMessage.response_feedback.reaction === 'liked' ? 'like' : 
                                               latestApiMessage.response_feedback.reaction === 'disliked' ? 'dislike' : 
                                               undefined;
                      }
                      
                      // Update the enriched message in the store (it's already added, so this updates it)
                      get().addMessage(conversation.id.toString(), finalMessage);
                      
                      logger.info('MESSAGES', 'Successfully enriched streaming message with API data', {
                        messageId: finalMessage.id,
                        hasDetails: !!finalMessage.details,
                        citationCount: finalMessage.citations?.length || 0
                      });
                    } else {
                      // API message exists but doesn't have expected format
                      logger.info('MESSAGES', 'API message format mismatch, keeping original message');
                    }
                  } else {
                    // No API messages found
                    logger.info('MESSAGES', 'No API messages found for enrichment');
                  }
                } catch (enrichmentError) {
                  logger.warn('MESSAGES', 'Failed to enrich streaming message, keeping basic version', enrichmentError);
                  // Message is already added, enrichment failed but user can still see the response
                }
              }
            }
        );
      } catch (setupError) {
        logger.error('MESSAGES', 'Failed to setup streaming', setupError);
        throw setupError;
      }
    } catch (error: any) {
      logger.error('MESSAGES', 'Failed to send message', error, {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        status: error.status,
        agentId: currentAgent.id,
        conversationId: conversation.id,
        sessionId: conversation.session_id
      });
      
      // Update user message status
      userMessage.status = 'error';
      get().addMessage(conversation.id.toString(), userMessage);
      
      // Extract error details including status code
      let errorText = 'Failed to send message';
      if (error.status) {
        switch (error.status) {
          case 429:
            errorText = 'You have exhausted your current query credits. Please contact customer service for assistance.';
            break;
          case 401:
            errorText = 'API Token is either missing or invalid';
            break;
          case 403:
            // Check if agent is inactive by looking at current agent status
            const agentStore = useAgentStore.getState();
            const { currentAgent: currentAgentFor403 } = agentStore;
            if (currentAgentFor403 && !currentAgentFor403.is_chat_active) {
              errorText = 'Agent is inactive - no documents uploaded. Please add documents to activate the agent.';
            } else {
              errorText = 'Access denied. You don\'t have permission to access this resource.';
            }
            break;
          case 404:
            errorText = 'Agent or conversation not found';
            break;
          case 400:
            errorText = 'Invalid request format';
            break;
          case 500:
            errorText = 'Internal server error. Please try again later.';
            break;
          default:
            errorText = error.message || `Error ${error.status}`;
        }
      } else if (error.message) {
        errorText = error.message;
      }
      
      set({ 
        streamingMessage: null,
        isStreaming: false,
        error: errorText,
        loading: false,
      });
      
      throw error;
    }
  },

  /**
   * Add or update a message in the store
   * 
   * Features:
   * - Handles both new messages and updates
   * - Maintains message order
   * - Automatically saves to local storage
   * - Efficient update using message ID lookup
   * 
   * @param conversationId - The conversation to add the message to
   * @param message - The message to add or update
   */
  addMessage: (conversationId: string, message: ChatMessage) => {
    set(state => {
      const newMessages = new Map(state.messages);
      const conversationMessages = newMessages.get(conversationId) || [];
      
      // Check if message already exists and update it
      const existingIndex = conversationMessages.findIndex(m => m.id === message.id);
      if (existingIndex >= 0) {
        // Update existing message
        conversationMessages[existingIndex] = message;
      } else {
        // Add new message
        conversationMessages.push(message);
      }
      
      newMessages.set(conversationId, conversationMessages);
      
      // Save to local storage as fallback
      saveMessagesToStorage(conversationId, conversationMessages);
      
      return { messages: newMessages };
    });
  },

  /**
   * Update the currently streaming message
   * 
   * Used during streaming to append content chunks
   * and update citations as they arrive
   * 
   * @param content - Content chunk to append
   * @param citations - Updated citations (optional)
   */
  updateStreamingMessage: (content: string, citations?: Citation[]) => {
    set(state => {
      if (!state.streamingMessage) return state;
      
      return {
        streamingMessage: {
          ...state.streamingMessage,
          content: state.streamingMessage.content + content, // Append content as-is during streaming
          citations: citations || state.streamingMessage.citations, // Update citations if provided
        },
      };
    });
  },

  clearMessages: (conversationId?: string) => {
    set(state => {
      if (conversationId) {
        const newMessages = new Map(state.messages);
        newMessages.delete(conversationId);
        return { messages: newMessages };
      } else {
        // Clear all messages
        return { messages: new Map() };
      }
    });
  },

  updateMessageFeedback: async (messageId: string, feedback: FeedbackType) => {
    const agentStore = useAgentStore.getState();
    const conversationStore = useConversationStore.getState();
    
    const { currentAgent } = agentStore;
    const { currentConversation } = conversationStore;
    
    if (!currentAgent || !currentConversation) {
      logger.warn('MESSAGES', 'Cannot update feedback - missing agent or conversation');
      return;
    }

    // Find the message
    const conversationMessages = get().messages.get(currentConversation.id.toString()) || [];
    const message = conversationMessages.find(m => m.id === messageId);
    
    if (!message) {
      logger.warn('MESSAGES', 'Message not found for feedback update', { messageId });
      return;
    }

    // Get the prompt ID from message details or try to extract from message ID
    let promptId: number | undefined;
    
    if (message.details?.prompt_id) {
      promptId = message.details.prompt_id;
    } else {
      // Try to extract from message ID format "{promptId}-assistant" or "{promptId}-user"
      const promptIdMatch = message.id.match(/^(\d+)-/);
      if (promptIdMatch) {
        promptId = parseInt(promptIdMatch[1]);
      }
    }
    
    if (!promptId) {
      logger.error('MESSAGES', 'Could not determine prompt ID for message', { messageId, details: message.details });
      toast.error('Unable to update feedback. Message ID not found.');
      return;
    }
    const sessionId = currentConversation.session_id;
    
    if (!sessionId) {
      logger.error('MESSAGES', 'Conversation missing session_id', { conversationId: currentConversation.id });
      return;
    }

    try {
      // Update local state immediately (optimistic update)
      const updatedMessage = { ...message, feedback };
      get().addMessage(currentConversation.id.toString(), updatedMessage);

      // Send to API
      const client = getClient();
      
      // Map feedback directly to API format (no neutral option)
      const feedbackValue = feedback === 'like' ? 'thumbs_up' : 'thumbs_down';
      
      logger.info('MESSAGES', 'Updating message feedback', {
        projectId: currentAgent.id,
        sessionId,
        promptId,
        feedback: feedbackValue
      });
      
      const response = await client.updateMessageFeedback(
        currentAgent.id,
        sessionId,
        promptId,
        { feedback: feedbackValue }
      );
      
      // The feedback was already updated optimistically above
      // The response doesn't include the updated message data in the expected format
      logger.info('MESSAGES', 'Message feedback updated successfully');
      
      // Show success toast
      toast.success('Thanks for your feedback!');
      
    } catch (error) {
      logger.error('MESSAGES', 'Failed to update message feedback', error);
      
      // Revert local state on error
      get().addMessage(currentConversation.id.toString(), message);
      
      // Show error toast
      if ((error as any)?.status === 401) {
        toast.error('Authentication failed. Please log in again.');
      } else if ((error as any)?.status === 404) {
        toast.error('Message not found.');
      } else {
        toast.error('Failed to update feedback. Please try again.');
      }
    }
  },

  // Utility methods
  getMessagesForConversation: (conversationId: string): ChatMessage[] => {
    return get().messages.get(conversationId) || [];
  },

  cancelStreaming: () => {
    globalStreamManager.cancelAllStreams();
    set({ 
      streamingMessage: null,
      isStreaming: false,
    });
  },

  /**
   * Load message history for a conversation
   * 
   * API Response Handling:
   * - Supports multiple response formats from the API
   * - Converts API format to internal ChatMessage format
   * - Falls back to local storage if API fails
   * - Handles both user_query and openai_response fields
   * - Fetches citation details for citation IDs
   * 
   * @param conversationId - The conversation to load messages for
   */
  loadMessages: async (conversationId: string) => {
    // Skip API calls in demo mode
    const isDemoMode = typeof window !== 'undefined' && (window as any).__customgpt_demo_mode;
    if (isDemoMode) {
      logger.info('MESSAGES', 'Skipping message load in demo mode', { conversationId });
      // Just ensure the conversation has an entry in the messages map
      set(state => {
        const newMessages = new Map(state.messages);
        if (!newMessages.has(conversationId)) {
          newMessages.set(conversationId, []);
        }
        return { messages: newMessages, loading: false };
      });
      return;
    }
    
    // Skip API calls for locally created conversations (they don't exist on server)
    if (conversationId.startsWith('conv_')) {
      logger.info('MESSAGES', 'Skipping API load for local conversation', { conversationId });
      set(state => {
        const newMessages = new Map(state.messages);
        if (!newMessages.has(conversationId)) {
          newMessages.set(conversationId, []);
        }
        return { messages: newMessages, loading: false };
      });
      return;
    }
    
    const agentStore = useAgentStore.getState();
    const conversationStore = useConversationStore.getState();
    const { currentAgent } = agentStore;
    const { conversations } = conversationStore;
    
    if (!currentAgent) {
      logger.warn('MESSAGES', 'No current agent when loading messages', { conversationId });
      return;
    }

    // Find the conversation to get its session_id
    const conversation = conversations.find(c => c.id.toString() === conversationId);
    if (!conversation) {
      logger.error('MESSAGES', 'Conversation not found in store', { 
        conversationId,
        availableConversations: conversations.map(c => c.id)
      });
      // Don't set error, just ensure empty message array exists
      set(state => {
        const newMessages = new Map(state.messages);
        if (!newMessages.has(conversationId)) {
          newMessages.set(conversationId, []);
        }
        return { messages: newMessages, loading: false };
      });
      return;
    }

    logger.info('MESSAGES', 'Loading messages for conversation', {
      conversationId,
      sessionId: conversation.session_id,
      agentId: currentAgent.id,
      agentName: currentAgent.project_name
    });

    set({ loading: true, error: null });

    try {
      const client = getClient();
      const response = await client.getMessages(currentAgent.id, conversation.session_id);
      logger.info('MESSAGES', 'Messages API response received', {
        conversationId,
        responseType: typeof response,
        hasData: !!(response as any)?.data,
        dataLength: Array.isArray((response as any)?.data) ? (response as any).data.length : 0
      });
      
      // Handle different response formats from the API
      let messages = [];
      if (response && typeof response === 'object') {
        // API documentation shows response format: { status: "success", data: { conversation: {...}, messages: { data: [...] } } }
        if ((response as any).data && (response as any).data.messages && Array.isArray((response as any).data.messages.data)) {
          messages = (response as any).data.messages.data;
        } else if (Array.isArray((response as any).data)) {
          messages = (response as any).data;
        } else if (Array.isArray(response)) {
          messages = response;
        } else if ((response as any).data && Array.isArray((response as any).data.data)) {
          messages = (response as any).data.data;
        }
      }
      
      logger.info('MESSAGES', 'Processing messages', {
        conversationId,
        messagesCount: messages.length,
        messageTypes: messages.map((m: any) => m.role || 'unknown')
      });
      
      // Convert API messages to our format
      // Each API message contains both user_query and openai_response, so we need to create two ChatMessage objects
      const formattedMessages: ChatMessage[] = [];
      
      if (Array.isArray(messages)) {
        // Process messages and fetch citation details
        for (const msg of messages) {
          const baseTimestamp = msg.created_at || msg.timestamp || new Date().toISOString();
          
          // Add user message
          if (msg.user_query) {
            formattedMessages.push({
              id: `${msg.id}-user` || `user-${Math.random()}`,
              role: 'user',
              content: msg.user_query,
              timestamp: baseTimestamp,
              status: 'sent' as const,
              details: {
                user_id: msg.user_id,
                conversation_id: msg.conversation_id,
                updated_at: msg.updated_at,
                prompt_id: msg.id,
                metadata: msg.metadata ? {
                  user_ip: msg.metadata.user_ip,
                  user_agent: msg.metadata.user_agent,
                  external_id: msg.metadata.external_id,
                  request_source: msg.metadata.request_source,
                } : undefined,
              },
            });
          }
          
          // Add assistant message
          if (msg.openai_response) {
            // Fetch citation details if citations exist
            let citationDetails: Citation[] = [];
            if (msg.citations && Array.isArray(msg.citations) && msg.citations.length > 0) {
              // Check if citations are already objects (future-proofing) or just IDs
              if (typeof msg.citations[0] === 'number') {
                // Citations are IDs, fetch details
                citationDetails = await fetchCitationDetails(msg.citations, currentAgent.id);
              } else {
                // Citations might already be objects, use as is
                citationDetails = msg.citations;
              }
            }
            
            formattedMessages.push({
              id: `${msg.id}-assistant` || `assistant-${Math.random()}`,
              role: 'assistant',
              content: msg.openai_response,
              citations: citationDetails,
              timestamp: baseTimestamp,
              status: 'sent' as const,
              feedback: msg.response_feedback?.reaction === 'liked' ? 'like' : 
                       msg.response_feedback?.reaction === 'disliked' ? 'dislike' : 
                       undefined,
              details: {
                user_id: msg.user_id,
                conversation_id: msg.conversation_id,
                updated_at: msg.updated_at,
                prompt_id: msg.id,
                metadata: msg.metadata ? {
                  user_ip: msg.metadata.user_ip,
                  user_agent: msg.metadata.user_agent,
                  external_id: msg.metadata.external_id,
                  request_source: msg.metadata.request_source,
                } : undefined,
              },
            });
          }
        }
      }

      logger.info('MESSAGES', 'Messages formatted successfully', {
        conversationId,
        formattedCount: formattedMessages.length
      });

      // Sort messages by timestamp to ensure chronological order
      formattedMessages.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB; // Ascending order (oldest first)
      });

      logger.info('MESSAGES', 'Messages sorted by timestamp', {
        conversationId,
        firstMessageTime: formattedMessages[0]?.timestamp,
        lastMessageTime: formattedMessages[formattedMessages.length - 1]?.timestamp
      });

      set(state => {
        const newMessages = new Map(state.messages);
        
        // Preserve any local messages that might be in sending state
        const existingMessages = state.messages.get(conversationId) || [];
        const localSendingMessages = existingMessages.filter(msg => 
          msg.status === 'sending' || 
          (msg.role === 'user' && 
           new Date(msg.timestamp).getTime() > Date.now() - 5000) // Messages sent in last 5 seconds
        );
        
        // Merge local sending messages with API messages
        const mergedMessages = [...formattedMessages];
        for (const localMsg of localSendingMessages) {
          if (!mergedMessages.find(m => m.id === localMsg.id)) {
            // Insert local message at the appropriate position based on timestamp
            const insertIndex = mergedMessages.findIndex(m => 
              new Date(m.timestamp).getTime() > new Date(localMsg.timestamp).getTime()
            );
            if (insertIndex === -1) {
              mergedMessages.push(localMsg);
            } else {
              mergedMessages.splice(insertIndex, 0, localMsg);
            }
          }
        }
        
        newMessages.set(conversationId, mergedMessages);
        
        // Save to local storage as fallback
        saveMessagesToStorage(conversationId, mergedMessages);
        
        return { 
          messages: newMessages,
          loading: false,
        };
      });
    } catch (error) {
      logger.error('MESSAGES', 'Failed to load messages', error, {
        conversationId,
        agentId: currentAgent.id,
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
        toast.error('Failed to load messages', {
          description: errorMessage || 'Please try again.',
          duration: 4000,
        });
      }
      
      // Try to load from local storage as fallback
      const cachedMessages = loadMessagesFromStorage(conversationId);
      if (cachedMessages && cachedMessages.length > 0) {
        logger.info('MESSAGES', 'Using cached messages as fallback', {
          conversationId,
          messageCount: cachedMessages.length
        });
        
        // Sort cached messages by timestamp to ensure chronological order
        cachedMessages.sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB; // Ascending order (oldest first)
        });
        
        set(state => {
          const newMessages = new Map(state.messages);
          newMessages.set(conversationId, cachedMessages);
          return { 
            messages: newMessages,
            loading: false,
            error: 'Using cached messages (API unavailable)'
          };
        });
      } else {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load messages',
          loading: false,
        });
      }
    }
  },
  
  /**
   * Clear the error state
   */
  clearError: () => {
    set({ error: null });
  },
  
  /**
   * Set messages for a specific conversation
   * Used for updating conversation messages directly
   */
  setMessagesForConversation: (conversationId: string, messages: ChatMessage[]) => {
    set(state => {
      const newMessages = new Map(state.messages);
      newMessages.set(conversationId, messages);
      return { messages: newMessages };
    });
  },

  /**
   * Regenerate the last assistant response
   * 
   * Flow:
   * 1. Find the last user message in the conversation
   * 2. Remove the last assistant message
   * 3. Resend the user message to get a new response
   */
  regenerateLastResponse: async () => {
    const agentStore = useAgentStore.getState();
    const conversationStore = useConversationStore.getState();
    
    const { currentAgent } = agentStore;
    const { currentConversation } = conversationStore;
    
    if (!currentAgent || !currentConversation) {
      logger.error('MESSAGES', 'Cannot regenerate - missing agent or conversation');
      toast.error('Cannot regenerate response. Please select a conversation.');
      return;
    }

    const conversationId = currentConversation.id.toString();
    const messages = get().getMessagesForConversation(conversationId);
    
    if (messages.length < 2) {
      logger.warn('MESSAGES', 'Not enough messages to regenerate');
      toast.error('No response to regenerate.');
      return;
    }

    // Find the last user message and last assistant message
    let lastUserMessage: ChatMessage | null = null;
    let lastAssistantMessage: ChatMessage | null = null;
    let lastAssistantIndex = -1;

    // Iterate backwards to find the last assistant and user messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!lastAssistantMessage && msg.role === 'assistant' && msg.status !== 'error') {
        lastAssistantMessage = msg;
        lastAssistantIndex = i;
      }
      if (!lastUserMessage && msg.role === 'user' && lastAssistantMessage) {
        lastUserMessage = msg;
        break;
      }
    }

    if (!lastUserMessage || !lastAssistantMessage) {
      logger.warn('MESSAGES', 'Could not find valid user/assistant message pair to regenerate');
      toast.error('No valid response to regenerate.');
      return;
    }

    logger.info('MESSAGES', 'Regenerating response', {
      conversationId,
      userMessageId: lastUserMessage.id,
      assistantMessageId: lastAssistantMessage.id,
      userContent: lastUserMessage.content.substring(0, 50)
    });

    // Remove the last assistant message
    const updatedMessages = [...messages];
    updatedMessages.splice(lastAssistantIndex, 1);
    get().setMessagesForConversation(conversationId, updatedMessages);

    // Save to local storage
    saveMessagesToStorage(conversationId, updatedMessages);

    try {
      // Resend the last user message
      await get().sendMessage(lastUserMessage.content);
      
      logger.info('MESSAGES', 'Response regenerated successfully');
    } catch (error) {
      logger.error('MESSAGES', 'Failed to regenerate response', error);
      
      // Restore the original assistant message on error
      get().setMessagesForConversation(conversationId, messages);
      saveMessagesToStorage(conversationId, messages);
      
      toast.error('Failed to regenerate response. Please try again.');
    }
  },
}));