import { Component, OnInit } from '@angular/core';
import { SettingsService, Settings } from '../../services/settings.service';

@Component({
  selector: 'app-terms-and-conditions',
  templateUrl: './terms-and-conditions.component.html',
  styleUrls: ['./terms-and-conditions.component.scss']
})
export class TermsAndConditionsComponent implements OnInit {
  settings: Settings | null = null;
  termsAndConditions: string = '';
  isLoading: boolean = true;

  private defaultTerms = `يشترط للتأجير :-

1- وجود رخصة سارية سارية.

2- وجود بطاقة هوية سارية.

3- قد يتطلب التأجير وجود بطاقة ائتمانية و مبلغ تأمين مسترجع.

4- عدم وجود أي مطالبات مالية أو متعثرات لدى شركات التأجير.

5- يحق لمقدم الخدمة الإمتناع عن التأجير في حال عدم الملائمة المالية للعميل.

6- سداد المبلغ لايعني بالضرورة الموافقة على تأجير العميل ، ويجوز رفض التأجير ورد المبلغ المدفوع في حال عدم انطباق شروط التأجير على العميل.

7- العمر يجب أن يكون أكثر من 21 سنة ميلادية.

8- عدم وجود مطالبات مالية على المستأجر أو مخالفات مرورية.

9- في حال الإلغاء من قبل العميل خلال نفس يوم الحجز ، وبعد توصيل السيارة ، سيتم خصم قيمة تأجير يوم كامل مع رسوم التوصيل ويتم أسترجاع المتبقي.

10- في حال عدم اكتمال عمليه التأجير لسبب عائد للمستأجر سيتم خصم قيمة يوم كامل مع رسوم التوصيل ويتم استرجاع المتبقي.

11- في حال عدم توفر نفس الفئة المطلوبة - سيتم توفير بديل من نفس الفئة - وفي حال عدم توفرة سيتم توفير فئة أعلى.

12- قد يختلف اللون عن الصورة المعروضة وسيتم توصيل السيارة حسب الألوان المتاحة.

13- وجود حساب فعال في أبشر وتوفر نفس رقم الجوال لدى المستأجر لحظة استلامه للسيارة.`;

  constructor(private settingsService: SettingsService) {}

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.isLoading = true;
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        this.termsAndConditions = settings.terms_and_conditions || this.defaultTerms;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        // Use default terms if API fails
        this.termsAndConditions = this.defaultTerms;
        this.isLoading = false;
      }
    });
  }

  formatText(text: string): string {
    if (!text) return this.defaultTerms;
    // Replace \r\n with line breaks
    return text.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>');
  }
}
