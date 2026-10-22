import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AETERNA | Personalized Longevity", description: "گزارش جامع طول عمر و سلامت شخصی‌سازی‌شده اترنا" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fa" dir="rtl"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/></head><body>{children}</body></html>;}
