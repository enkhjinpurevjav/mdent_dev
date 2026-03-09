import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function UsersTabs() {
  const router = useRouter();
  const path = router.pathname; // e.g. "/users", "/users/doctors", "/users/reception"

  const isActive = (href: string) => path === href;

  const linkClass = (active: boolean) =>
    `inline-block px-4 py-2 no-underline border-b-[3px] text-blue-600 ${
      active ? "border-blue-600 font-semibold" : "border-transparent font-normal"
    }`;

  return (
    <nav>
      <ul className="list-none p-0 mb-4 flex gap-2 border-b border-gray-200">
        <li>
          <Link href="/users" legacyBehavior>
            <a className={linkClass(isActive("/users"))}>Бүгд</a>
          </Link>
        </li>
        <li>
          <Link href="/users/doctors" legacyBehavior>
            <a className={linkClass(isActive("/users/doctors"))}>Эмч</a>
          </Link>
        </li>
        <li>
          <Link href="/users/reception" legacyBehavior>
            <a className={linkClass(isActive("/users/reception"))}>Ресепшн</a>
          </Link>
        </li>
        <li>
          <Link href="/users/nurses" legacyBehavior>
            <a className={linkClass(isActive("/users/nurses"))}>Сувилагч</a>
          </Link>
        </li>
        <li>
          <Link href="/users/staff" legacyBehavior>
            <a className={linkClass(isActive("/users/staff"))}>Бусад ажилтан</a>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
