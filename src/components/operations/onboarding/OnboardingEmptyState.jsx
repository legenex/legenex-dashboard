import React from 'react';
import { Inbox } from 'lucide-react';

// Shown when there are no onboarding records. Explains where submissions come
// from and that each one is brought live here step by step. No empty table.
export default function OnboardingEmptyState() {
  return (
    <div className="bg-card border border-border rounded-[12px] py-16 px-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">No onboarding submissions yet</h3>
      <p className="text-[13px] text-muted-foreground mt-2 max-w-md leading-relaxed">
        Submissions arrive from the public application form at{' '}
        <span className="font-mono text-foreground">/apply</span>. Each one shows up here and is
        brought live step by step, one tracked step at a time, so you always know exactly where a
        buyer is in setup.
      </p>
    </div>
  );
}