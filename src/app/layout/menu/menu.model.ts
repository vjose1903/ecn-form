export interface MenuItem {
  label: string;
  icon: string;
  link?: string;
  severity?: 'danger' | 'contrast';
  command?: () => void;
  liClass?: string;
}