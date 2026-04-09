import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { OnboardingView } from './views/OnboardingView.js';
import { ChatView } from './views/ChatView.js';
import { checkFirstRun, markSetupComplete } from '../onboarding/setup.js';

export function App() {
  const [view, setView] = useState<'loading' | 'onboarding' | 'chat'>('loading');

  useEffect(() => {
    if (checkFirstRun()) {
      setView('onboarding');
    } else {
      setView('chat');
    }
  }, []);

  if (view === 'loading') {
    return <Box><Text>Loading...</Text></Box>;
  }

  if (view === 'onboarding') {
    return (
      <OnboardingView 
        onComplete={() => {
          markSetupComplete();
          setView('chat');
        }} 
      />
    );
  }

  return <ChatView />;
}
