/**
 * Example: Turnstile Chat Integration
 * 
 * This example shows how to integrate Turnstile human verification
 * with a chat interface. Copy and adapt this code for your needs.
 * 
 * Features demonstrated:
 * - Anonymous user verification gate
 * - Token management for API calls
 * - Error handling for verification failures
 * - Seamless user experience
 */

'use client';

import React, { useState, useCallback } from 'react';
import { TurnstileGate, TurnstileStatus } from '@/components/chat/TurnstileGate';
import { ChatInput } from '@/components/chat/ChatInput';
import { useTurnstileToken } from '@/hooks/useTurnstileToken';
import { toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export function TurnstileChatExample() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  
  const { 
    fetchWithTurnstile, 
    setToken: setTurnstileToken,
    isValid: isTurnstileValid 
  } = useTurnstileToken();

  // Handle Turnstile verification success
  const handleVerificationChange = useCallback((verified: boolean, token?: string) => {
    setIsVerified(verified);
    
    if (verified && token) {
      setTurnstileToken(token);
      toast.success('Human verification complete! You can now chat.');
    } else if (!verified) {
      toast.warning('Please complete the security verification to continue.');
    }
  }, [setTurnstileToken]);

  // Send message with Turnstile protection
  const handleSendMessage = useCallback(async (content: string, files?: File[]) => {
    if (!isVerified) {
      toast.error('Please complete verification first.');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Use fetchWithTurnstile for automatic token inclusion
      const response = await fetchWithTurnstile('/api/proxy/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          files: files?.map(f => ({ name: f.name, size: f.size })) || [],
        }),
      });

      if (response.status === 403) {
        // Handle Turnstile verification required
        const data = await response.json();
        if (data.turnstileRequired) {
          setIsVerified(false);
          toast.error('Verification expired. Please complete the challenge again.');
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        content: data.message || 'Sorry, I could not process your request.',
        role: 'assistant',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isVerified, fetchWithTurnstile]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header with verification status */}
      <div className="p-4 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Secure Chat</h1>
          {isVerified && isTurnstileValid && (
            <TurnstileStatus isVerified={true} />
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <p>Welcome to the secure chat!</p>
            <p className="text-sm mt-2">
              {isVerified 
                ? 'You can now start chatting.' 
                : 'Please complete the security verification below to begin.'
              }
            </p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="animate-pulse flex space-x-1">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat input with Turnstile gate */}
      <div className="border-t bg-background/95 backdrop-blur">
        <TurnstileGate
          onVerificationChange={handleVerificationChange}
          className="p-4"
        >
          <ChatInput
            onSend={handleSendMessage}
            disabled={isLoading || !isVerified}
            placeholder={
              isVerified 
                ? "Type your message..." 
                : "Complete verification above to start chatting"
            }
          />
        </TurnstileGate>
      </div>
    </div>
  );
}

/**
 * Alternative: Widget Integration Example
 * 
 * For widget deployments where you want Turnstile in a modal or popup
 */
export function TurnstileWidgetExample() {
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleVerificationNeeded = useCallback(() => {
    setShowTurnstile(true);
  }, []);

  const handleVerificationComplete = useCallback((verified: boolean) => {
    setIsVerified(verified);
    setShowTurnstile(false);
    
    if (verified) {
      toast.success('Verification complete!');
    }
  }, []);

  return (
    <div className="widget-container">
      {/* Main widget content */}
      <div className="p-4">
        <h3 className="font-semibold mb-2">Chat Widget</h3>
        
        {isVerified ? (
          <ChatInput
            onSend={(message) => {
              // Handle message with automatic Turnstile token inclusion
              console.log('Sending:', message);
            }}
            mode="widget"
          />
        ) : (
          <button
            onClick={handleVerificationNeeded}
            className="w-full p-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Start Secure Chat
          </button>
        )}
      </div>

      {/* Turnstile modal */}
      {showTurnstile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
            <TurnstileGate
              onVerificationChange={handleVerificationComplete}
            >
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Verification complete! You can now chat securely.
                </p>
              </div>
            </TurnstileGate>
            
            <button
              onClick={() => setShowTurnstile(false)}
              className="mt-4 w-full p-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TurnstileChatExample;
