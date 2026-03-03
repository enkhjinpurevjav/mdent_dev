import React from "react";

type PageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <main className={`max-w-5xl mx-auto px-4 py-4 font-sans ${className}`}>
      {children}
    </main>
  );
}
