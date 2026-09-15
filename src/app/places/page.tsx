import { redirect } from "next/navigation";

// 場所の登録は今後の機能。以前のURLからは保存済みマップへ案内する。
export default function PlacesPage() {
  redirect("/offline-evac/index.html");
}
