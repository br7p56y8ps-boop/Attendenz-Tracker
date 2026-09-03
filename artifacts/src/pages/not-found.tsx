import React from 'react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center p-8 bg-card rounded-2xl shadow-sm border border-border">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-4">Page not found.</p>
        <a href={import.meta.env.BASE_URL || '/'} className="text-primary hover:underline">Return to Home</a>
      </div>
    </div>
  );
}
