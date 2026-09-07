// =====================================================================
// clicker/color-palette.js
//
// Curated common-filament color palette shared by every Clicker color
// picker — TOP color regions (clicker-ui.js) and HOUSING (wired via
// clicker-viewer.js through window.openClickerColorPalette, since the
// popover itself is owned/rendered by clicker-ui.js). Centralized here
// so there is exactly one list to maintain, not two drifting copies.
//
// Pure data, zero dependencies — matches this project's convention of
// centralizing shared config in its own file (see stem-profile.js).
// =====================================================================

export const CURATED_FILAMENT_PALETTE = [
  { family: "ขาว", swatches: [{ hex: "#ffffff", name: "ขาว" }] },
  { family: "ดำ", swatches: [{ hex: "#0a0a0a", name: "ดำ" }] },
  { family: "เทา", swatches: [
    { hex: "#4d4d4d", name: "เทาเข้ม" },
    { hex: "#9e9e9e", name: "เทา" },
    { hex: "#cfcfcf", name: "เทาอ่อน" },
  ] },
  { family: "ครีม / เบจ", swatches: [
    { hex: "#f0e6d2", name: "ครีม" },
    { hex: "#d8c3a5", name: "เบจ" },
  ] },
  { family: "น้ำตาล", swatches: [
    { hex: "#6b4423", name: "น้ำตาลเข้ม" },
    { hex: "#a9702f", name: "น้ำตาล" },
  ] },
  { family: "แดง", swatches: [
    { hex: "#d32f2f", name: "แดง" },
    { hex: "#8b1a1a", name: "แดงเข้ม" },
  ] },
  { family: "ชมพู", swatches: [
    { hex: "#ffc1cc", name: "ชมพูอ่อน" },
    { hex: "#ff7eb6", name: "ชมพู" },
    { hex: "#d6336c", name: "บานเย็น" },
  ] },
  { family: "ส้ม", swatches: [
    { hex: "#ff7f11", name: "ส้ม" },
    { hex: "#ffa94d", name: "ส้มอ่อน" },
  ] },
  { family: "เหลือง", swatches: [
    { hex: "#ffd60a", name: "เหลือง" },
    { hex: "#fff275", name: "เหลืองอ่อน" },
  ] },
  { family: "เขียว", swatches: [
    { hex: "#0f5132", name: "เขียวเข้ม" },
    { hex: "#2e7d32", name: "เขียว" },
    { hex: "#7cb342", name: "เขียวมะนาว" },
  ] },
  { family: "เขียวมิ้นท์ / เทอร์ควอยซ์", swatches: [
    { hex: "#00897b", name: "เทอร์ควอยซ์" },
    { hex: "#4dd0c4", name: "มิ้นท์" },
  ] },
  { family: "ฟ้า / น้ำเงิน", swatches: [
    { hex: "#78c8ff", name: "ฟ้า" },
    { hex: "#1565c0", name: "น้ำเงิน" },
    { hex: "#0d1b6e", name: "กรมท่า" },
  ] },
  { family: "ม่วง", swatches: [
    { hex: "#c77dff", name: "ม่วงอ่อน" },
    { hex: "#a889ff", name: "ม่วง" },
    { hex: "#7b2cbf", name: "ม่วงเข้ม" },
  ] },
];
