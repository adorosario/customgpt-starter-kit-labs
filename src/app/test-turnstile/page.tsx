/**
 * Turnstile Test Page
 * 
 * Simple test page to verify Turnstile integration is working.
 * Navigate to /test-turnstile to see this page.
 */

'use client';

import React, { useState } from 'react';
import { TurnstileGate } from '@/components/chat/TurnstileGate';
import { useTurnstileToken } from '@/hooks/useTurnstileToken';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function TurnstileTestPage() {
  const [isVerified, setIsVerified] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { fetchWithTurnstile } = useTurnstileToken();

  const handleVerificationChange = (verified: boolean, token?: string) => {
    setIsVerified(verified);
    setCurrentToken(token || null);
    
    if (verified && token) {
      toast.success('Turnstile verification successful!');
      setTestResults(prev => [...prev, `✅ Verification successful at ${new Date().toLocaleTimeString()}`]);
    } else if (!verified) {
      toast.warning('Turnstile verification required');
      setTestResults(prev => [...prev, `⚠️ Verification required at ${new Date().toLocaleTimeString()}`]);
    }
  };

  const testAPICall = async () => {
    if (!isVerified || !currentToken) {
      toast.error('Please complete Turnstile verification first');
      return;
    }

    setIsLoading(true);
    setTestResults(prev => [...prev, `🧪 Testing API call at ${new Date().toLocaleTimeString()}`]);

    try {
      // Test the verification endpoint first
      const verifyResponse = await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken, action: 'test' })
      });

      const verifyResult = await verifyResponse.json();
      
      if (verifyResult.success) {
        setTestResults(prev => [...prev, `✅ Token verification successful`]);
      } else {
        setTestResults(prev => [...prev, `❌ Token verification failed: ${verifyResult.message}`]);
        return;
      }

      // Test a protected API endpoint
      const apiResponse = await fetchWithTurnstile('/api/proxy/projects', {
        method: 'GET'
      });

      if (apiResponse.status === 200) {
        setTestResults(prev => [...prev, `✅ API call successful (200)`]);
        toast.success('API call successful!');
      } else if (apiResponse.status === 403) {
        const errorData = await apiResponse.json();
        if (errorData.turnstileRequired) {
          setTestResults(prev => [...prev, `⚠️ API still requires Turnstile (403)`]);
        } else {
          setTestResults(prev => [...prev, `❌ API forbidden (403) - other reason`]);
        }
      } else {
        setTestResults(prev => [...prev, `ℹ️ API response: ${apiResponse.status}`]);
      }

    } catch (error) {
      console.error('API test error:', error);
      setTestResults(prev => [...prev, `❌ API test failed: ${error}`]);
      toast.error('API test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Turnstile Integration Test
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Test the Cloudflare Turnstile human verification system
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Verification Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Verification Status
            </h2>
            
            <div className="mb-4">
              {isVerified ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-green-800 dark:text-green-200 font-medium">
                    Verified Human
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                    Verification Required
                  </span>
                </div>
              )}
            </div>

            {/* Token Display */}
            {currentToken && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Token:
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-xs break-all">
                  {currentToken.slice(0, 50)}...
                </div>
              </div>
            )}

            {/* Test Button */}
            <Button
              onClick={testAPICall}
              disabled={!isVerified || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Testing API...
                </>
              ) : (
                'Test API Call'
              )}
            </Button>
          </div>

          {/* Turnstile Challenge Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Human Verification
            </h2>
            
            <TurnstileGate
              onVerificationChange={handleVerificationChange}
              showInDemo={true} // Force show even if authenticated
            >
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-green-800 dark:text-green-200 font-medium">
                  Verification Complete!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  You can now test the API functionality.
                </p>
              </div>
            </TurnstileGate>
          </div>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Test Results
              </h2>
              <Button variant="outline" size="sm" onClick={clearResults}>
                Clear Results
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm font-mono"
                >
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            How to Test
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300">
            <li>Complete the Turnstile challenge above</li>
            <li>Click &quot;Test API Call&quot; to verify the integration</li>
            <li>Check the test results for success/failure details</li>
            <li>Open browser dev tools to see network requests</li>
            <li>Check the server logs for verification attempts</li>
          </ol>
          
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Open this page in an incognito window to test as an anonymous user.
              Authenticated users may bypass Turnstile verification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
