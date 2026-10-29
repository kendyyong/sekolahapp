import {
  BadgePercent, Bell, BookOpen, Building2, CalendarCheck, CalendarDays, ClipboardCheck, ClipboardList, CreditCard,
  Fingerprint, GraduationCap, HeartHandshake, House, IdCard, Landmark, LayoutDashboard, MailOpen, MapPin, Megaphone,
  MessageCircle, MessagesSquare, NotebookPen, NotebookText, Receipt, School, ScanLine, ScrollText, Settings, ShieldCheck, Sprout, Tags,
  Store, TriangleAlert, Timer, UserCheck, UserCog, UserPlus, Users, UsersRound, UtensilsCrossed, Video, Wallet, type LucideIcon,
} from "lucide-react";

/** Ikon menu dipanggil lewat nama supaya data navigasi tetap bisa dikirim dari server ke komponen klien. */
export const ICONS = {
  alert: TriangleAlert, bell: Bell, book: BookOpen, building: Building2, calendar: CalendarDays, calendarCheck: CalendarCheck,
  card: CreditCard, clipboardCheck: ClipboardCheck, clipboardList: ClipboardList, dashboard: LayoutDashboard,
  fingerprint: Fingerprint, graduation: GraduationCap, heart: HeartHandshake, home: House, idCard: IdCard, landmark: Landmark,
  mailOpen: MailOpen, mapPin: MapPin, megaphone: Megaphone, messages: MessagesSquare, whatsapp: MessageCircle, notebookPen: NotebookPen,
  notebookText: NotebookText, percent: BadgePercent, receipt: Receipt, scan: ScanLine, school: School, scroll: ScrollText,
  settings: Settings, shield: ShieldCheck, sprout: Sprout, tags: Tags, userCheck: UserCheck, userCog: UserCog, userPlus: UserPlus, users: Users,
  store: Store, timer: Timer, usersRound: UsersRound, utensils: UtensilsCrossed, video: Video, wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
