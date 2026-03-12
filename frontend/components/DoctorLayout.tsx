diff --git a/frontend/components/DoctorLayout.tsx b/frontend/components/DoctorLayout.tsx
@@
 export default function DoctorLayout({ children }: Props) {
@@
   return (
-    <div className="min-h-[100dvh] bg-gray-100 overflow-x-clip">
+    <div className="min-h-[100dvh] bg-gray-100 overflow-x-hidden">
       {/* Top Bar */}
-      <header className="fixed top-0 left-0 right-0 h-14 text-white z-[100]" style={{ background: NAVY }}>
-        <div className="h-full w-full px-3 flex items-center justify-between sm:max-w-[720px] sm:mx-auto">
+      <header className="fixed top-0 left-0 right-0 h-11 text-white z-[100] overflow-x-hidden" style={{ background: NAVY }}>
+        <div className="h-full w-full px-3 flex items-center justify-between min-w-0 sm:max-w-[720px] sm:mx-auto">
           {/* Brand */}
           <Link href="/doctor/appointments" className="min-w-0 flex items-center gap-2 no-underline text-white">
@@
           </Link>
 
           {/* Right actions */}
-          <div className="flex shrink-0 items-center gap-0.5">
-            <button title="Мэдэгдэл" disabled className="p-2 rounded-lg text-white/60 cursor-default">
-              <Bell className="h-5 w-5" />
+          <div className="flex items-center gap-0 min-w-0">
+            <button title="Мэдэгдэл" disabled className="p-1.5 sm:p-2 rounded-lg text-white/60 cursor-default">
+              <Bell className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
             </button>
 
             <Link
               href="/doctor/performance"
               title="Гүйцэтгэл"
               className={classNames(
-                "p-2 rounded-lg inline-flex items-center no-underline",
+                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                 isActive("/doctor/performance") ? "text-white" : "text-white/75 hover:text-white"
               )}
             >
-              <BarChart3 className="h-5 w-5" />
+              <BarChart3 className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
             </Link>
 
             <Link
               href="/doctor/history"
               title="Үзлэгийн түүх"
               className={classNames(
-                "p-2 rounded-lg inline-flex items-center no-underline",
+                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                 isActive("/doctor/history") ? "text-white" : "text-white/75 hover:text-white"
               )}
             >
-              <ClipboardList className="h-5 w-5" />
+              <ClipboardList className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
             </Link>
 
-            <button onClick={handleLogout} title="Гарах" className="p-2 rounded-lg text-white/75 hover:text-white">
-              <LogOut className="h-5 w-5" />
+            <button onClick={handleLogout} title="Гарах" className="p-1.5 sm:p-2 rounded-lg text-white/75 hover:text-white">
+              <LogOut className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
             </button>
           </div>
         </div>
       </header>
 
       {/* Content */}
-      <main className="pt-14 pb-[60px] w-full px-3 sm:px-4 sm:max-w-[720px] sm:mx-auto overflow-x-clip">
+      <main className="pt-11 pb-[60px] w-full px-3 sm:px-4 sm:max-w-[720px] sm:mx-auto overflow-x-hidden">
         {children}
       </main>
 
       {/* Bottom Nav */}
-      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 z-[100]">
-        <div className="h-full w-full flex sm:max-w-[720px] sm:mx-auto">
+      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 z-[100] overflow-x-hidden">
+        <div className="h-full w-full flex min-w-0 sm:max-w-[720px] sm:mx-auto">
           {BOTTOM_NAV.map((item) => {
             const active = isActive(item.href);
             return (
               <Link
                 key={item.href}
                 href={item.href}
                 className={classNames(
                   "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 no-underline",
                   active
                     ? "text-[#131a29] font-bold border-t-2 border-[#131a29]"
                     : "text-gray-400 font-normal border-t-2 border-transparent"
                 )}
               >
                 <BottomIcon kind={item.icon} active={active} />
 
                 <span className="text-[10px] leading-none truncate sm:hidden">{item.shortLabel}</span>
                 <span className="hidden sm:block text-[10px] leading-none truncate px-1">{item.label}</span>
               </Link>
             );
           })}
         </div>
       </nav>
     </div>
   );
 }
