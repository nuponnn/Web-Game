// ค่าคงที่กลางของระบบ (single source of truth)
// กันค่าต่างๆ กระจัดกระจายไปตามไฟล์แล้วแก้ไม่ครบ

// จำนวนผู้เล่นขั้นต่ำกว่าจะเริ่มเกมได้
export const MIN_PLAYERS = 3;

// จำนวนผู้เล่นสูงสุดต่อห้อง
export const MAX_PLAYERS = 8;

// แต่ละ location ต้องมี role อย่างน้อย MAX_PLAYERS - 1 อัน
// เพราะในห้อง 1 คนจะเป็น spy (ไม่ต้องมี role) ที่เหลือคือผู้เล่นปกติต้องได้ role
// ถ้า roles น้อยกว่านี้ ผู้เล่นปกติบางคนจะสุ่มได้ role ซ้ำกัน
export const MIN_ROLES = MAX_PLAYERS - 1; // 7

export const MAX_JOKER_COUNT = 5;

export const DEFAULT_ROUND_DURATION_MS = 8 * 60 * 1000;
export const MIN_ROUND_DURATION_MS = 60 * 1000;
export const MAX_ROUND_DURATION_MS = 15 * 60 * 1000;

export const DEFAULT_VOTE_DURATION_MS = 30 * 1000;
export const MIN_VOTE_DURATION_MS = 10 * 1000;
export const MAX_VOTE_DURATION_MS = 120 * 1000;

// เวลาให้ spy เดาสถานที่หลังจบการโหวต (spy/joker โดนโหวต)
export const DEFAULT_GUESS_DURATION_MS = 30 * 1000;
export const MIN_GUESS_DURATION_MS = 10 * 1000;
export const MAX_GUESS_DURATION_MS = 120 * 1000;
