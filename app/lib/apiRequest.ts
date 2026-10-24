import { auth } from "./firebase";

type ApiErrorPayload = { error?: { message?: unknown } };

export async function apiRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  let response: Response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }

  let data: ApiErrorPayload & Record<string, unknown>;
  try {
    data = (await response.json()) as ApiErrorPayload & Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่ถูกต้อง กรุณาลองอีกครั้ง"
        : `เซิร์ฟเวอร์ขัดข้อง (${response.status}) กรุณาลองอีกครั้ง`,
    );
  }

  if (!response.ok) {
    const message = data?.error?.message;
    throw new Error(
      typeof message === "string" && message.trim()
        ? message
        : `คำขอไม่สำเร็จ (${response.status}) กรุณาลองอีกครั้ง`,
    );
  }

  return data as T;
}
