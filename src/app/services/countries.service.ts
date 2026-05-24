import { Injectable } from '@angular/core';

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flagUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountriesService {
  private countries: Country[] = [
    { code: 'SA', name: 'السعودية', dialCode: '+966', flagUrl: 'https://flagcdn.com/w20/sa.png' },
    { code: 'EG', name: 'مصر', dialCode: '+20', flagUrl: 'https://flagcdn.com/w20/eg.png' },
    { code: 'AE', name: 'الإمارات', dialCode: '+971', flagUrl: 'https://flagcdn.com/w20/ae.png' },
    { code: 'KW', name: 'الكويت', dialCode: '+965', flagUrl: 'https://flagcdn.com/w20/kw.png' },
    { code: 'QA', name: 'قطر', dialCode: '+974', flagUrl: 'https://flagcdn.com/w20/qa.png' },
    { code: 'BH', name: 'البحرين', dialCode: '+973', flagUrl: 'https://flagcdn.com/w20/bh.png' },
    { code: 'OM', name: 'عمان', dialCode: '+968', flagUrl: 'https://flagcdn.com/w20/om.png' },
    { code: 'JO', name: 'الأردن', dialCode: '+962', flagUrl: 'https://flagcdn.com/w20/jo.png' },
    { code: 'LB', name: 'لبنان', dialCode: '+961', flagUrl: 'https://flagcdn.com/w20/lb.png' },
    { code: 'IQ', name: 'العراق', dialCode: '+964', flagUrl: 'https://flagcdn.com/w20/iq.png' },
    { code: 'SY', name: 'سوريا', dialCode: '+963', flagUrl: 'https://flagcdn.com/w20/sy.png' },
    { code: 'YE', name: 'اليمن', dialCode: '+967', flagUrl: 'https://flagcdn.com/w20/ye.png' },
    { code: 'PS', name: 'فلسطين', dialCode: '+970', flagUrl: 'https://flagcdn.com/w20/ps.png' },
    { code: 'MA', name: 'المغرب', dialCode: '+212', flagUrl: 'https://flagcdn.com/w20/ma.png' },
    { code: 'DZ', name: 'الجزائر', dialCode: '+213', flagUrl: 'https://flagcdn.com/w20/dz.png' },
    { code: 'TN', name: 'تونس', dialCode: '+216', flagUrl: 'https://flagcdn.com/w20/tn.png' },
    { code: 'LY', name: 'ليبيا', dialCode: '+218', flagUrl: 'https://flagcdn.com/w20/ly.png' },
    { code: 'SD', name: 'السودان', dialCode: '+249', flagUrl: 'https://flagcdn.com/w20/sd.png' },
    { code: 'US', name: 'الولايات المتحدة', dialCode: '+1', flagUrl: 'https://flagcdn.com/w20/us.png' },
    { code: 'GB', name: 'المملكة المتحدة', dialCode: '+44', flagUrl: 'https://flagcdn.com/w20/gb.png' },
    { code: 'FR', name: 'فرنسا', dialCode: '+33', flagUrl: 'https://flagcdn.com/w20/fr.png' },
    { code: 'DE', name: 'ألمانيا', dialCode: '+49', flagUrl: 'https://flagcdn.com/w20/de.png' },
    { code: 'IT', name: 'إيطاليا', dialCode: '+39', flagUrl: 'https://flagcdn.com/w20/it.png' },
    { code: 'ES', name: 'إسبانيا', dialCode: '+34', flagUrl: 'https://flagcdn.com/w20/es.png' },
    { code: 'TR', name: 'تركيا', dialCode: '+90', flagUrl: 'https://flagcdn.com/w20/tr.png' },
    { code: 'IN', name: 'الهند', dialCode: '+91', flagUrl: 'https://flagcdn.com/w20/in.png' },
    { code: 'CN', name: 'الصين', dialCode: '+86', flagUrl: 'https://flagcdn.com/w20/cn.png' },
    { code: 'JP', name: 'اليابان', dialCode: '+81', flagUrl: 'https://flagcdn.com/w20/jp.png' },
    { code: 'KR', name: 'كوريا الجنوبية', dialCode: '+82', flagUrl: 'https://flagcdn.com/w20/kr.png' },
    { code: 'RU', name: 'روسيا', dialCode: '+7', flagUrl: 'https://flagcdn.com/w20/ru.png' },
    { code: 'BR', name: 'البرازيل', dialCode: '+55', flagUrl: 'https://flagcdn.com/w20/br.png' },
    { code: 'MX', name: 'المكسيك', dialCode: '+52', flagUrl: 'https://flagcdn.com/w20/mx.png' },
    { code: 'CA', name: 'كندا', dialCode: '+1', flagUrl: 'https://flagcdn.com/w20/ca.png' },
    { code: 'AU', name: 'أستراليا', dialCode: '+61', flagUrl: 'https://flagcdn.com/w20/au.png' },
    { code: 'NZ', name: 'نيوزيلندا', dialCode: '+64', flagUrl: 'https://flagcdn.com/w20/nz.png' },
    { code: 'ZA', name: 'جنوب أفريقيا', dialCode: '+27', flagUrl: 'https://flagcdn.com/w20/za.png' },
    { code: 'NG', name: 'نيجيريا', dialCode: '+234', flagUrl: 'https://flagcdn.com/w20/ng.png' },
    { code: 'KE', name: 'كينيا', dialCode: '+254', flagUrl: 'https://flagcdn.com/w20/ke.png' },
    { code: 'PK', name: 'باكستان', dialCode: '+92', flagUrl: 'https://flagcdn.com/w20/pk.png' },
    { code: 'BD', name: 'بنغلاديش', dialCode: '+880', flagUrl: 'https://flagcdn.com/w20/bd.png' },
    { code: 'ID', name: 'إندونيسيا', dialCode: '+62', flagUrl: 'https://flagcdn.com/w20/id.png' },
    { code: 'PH', name: 'الفلبين', dialCode: '+63', flagUrl: 'https://flagcdn.com/w20/ph.png' },
    { code: 'VN', name: 'فيتنام', dialCode: '+84', flagUrl: 'https://flagcdn.com/w20/vn.png' },
    { code: 'TH', name: 'تايلاند', dialCode: '+66', flagUrl: 'https://flagcdn.com/w20/th.png' },
    { code: 'MY', name: 'ماليزيا', dialCode: '+60', flagUrl: 'https://flagcdn.com/w20/my.png' },
    { code: 'SG', name: 'سنغافورة', dialCode: '+65', flagUrl: 'https://flagcdn.com/w20/sg.png' },
    { code: 'HK', name: 'هونغ كونغ', dialCode: '+852', flagUrl: 'https://flagcdn.com/w20/hk.png' },
    { code: 'TW', name: 'تايوان', dialCode: '+886', flagUrl: 'https://flagcdn.com/w20/tw.png' }
  ];

  getCountries(): Country[] {
    return this.countries;
  }

  getCountryByDialCode(dialCode: string): Country | undefined {
    return this.countries.find(country => country.dialCode === dialCode);
  }
}
