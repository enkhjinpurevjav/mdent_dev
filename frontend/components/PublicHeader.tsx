export default function PublicHeader() {
  return (
    <header className="bg-gray-900 text-white px-6 py-3 flex items-center gap-3 shadow">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mdent.svg"
        alt="M Dent logo"
        width={36}
        height={36}
        className="shrink-0"
      />
      <span className="text-lg font-semibold tracking-wide">M Dent Software Solution</span>
    </header>
  );
}
