/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ensureAnonymousSession } from './firebase/config';
import Home from './pages/Home';
import Game from './pages/Game';

export default function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;

    void ensureAnonymousSession()
      .catch((error) => {
        console.error('Firebase session initialization failed.', error);
      })
      .finally(() => {
        if (!active) return;
        setAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!authReady) {
    return (
      <Layout className="items-center">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2
            className="h-10 w-10 animate-spin text-brand-yellow"
            aria-label="Loading"
          />
        </div>
      </Layout>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Game />} />
      </Routes>
    </BrowserRouter>
  );
}
