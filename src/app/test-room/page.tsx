import { notFound } from "next/navigation";
import TestRoomClient from "./TestRoomClient";

// ローカルの本番ビルド検証では、起動時の明示指定でだけ利用する。
export const dynamic = "force-dynamic";

export default function TestRoomPage() {
  const localPreview = process.env.NODE_ENV === "development"
    || process.env.ENABLE_LOCAL_TEST_PAGES === "1";
  if (process.env.VERCEL === "1" || !localPreview) notFound();
  return <TestRoomClient />;
}
