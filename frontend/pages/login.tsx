import Link from "next/link";
import LoginForm from "../components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Top dark header */}
      <header className="bg-gray-900 text-white px-6 py-3 flex items-center shadow">
        <span className="text-lg font-semibold tracking-wide">M DENT</span>
      </header>

      {/* Centered card */}
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Нэвтрэх</h1>
          <LoginForm />
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Нууц үг сэргээх
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
