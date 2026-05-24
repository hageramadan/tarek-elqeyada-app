import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
import { CountriesService, Country } from '../../../services/countries.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit, OnDestroy {
  registerForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  countries: Country[] = [];
  selectedCountry: Country | null = null;
  isCountryDropdownOpen = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private modalService: ModalService,
    private countriesService: CountriesService,
    private toastr: ToastrService
  ) {
    this.registerForm = this.fb.group({
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9,}$/)]],
      countryCode: ['+966']
    });
  }

  ngOnInit() {
    this.countries = this.countriesService.getCountries();
    const defaultCountry = this.countriesService.getCountryByDialCode('+966');
    this.selectedCountry = defaultCountry || this.countries[0];
    this.registerForm.patchValue({ countryCode: this.selectedCountry.dialCode });
    // Lock body scroll when modal opens
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy() {
    // Unlock body scroll when modal closes
    document.body.style.overflow = '';
  }

  toggleCountryDropdown() {
    this.isCountryDropdownOpen = !this.isCountryDropdownOpen;
  }

  selectCountry(country: Country) {
    this.selectedCountry = country;
    this.registerForm.patchValue({ countryCode: country.dialCode });
    this.isCountryDropdownOpen = false;
  }

  onCountryChange(event: any) {
    const dialCode = event.target.value;
    this.selectedCountry = this.countriesService.getCountryByDialCode(dialCode) || null;
    this.registerForm.patchValue({ countryCode: dialCode });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.country-code-wrapper')) {
      this.isCountryDropdownOpen = false;
    }
  }

  closeModal() {
    this.isCountryDropdownOpen = false;
    document.body.style.overflow = '';
    this.modalService.closeModal();
  }

  switchToLogin() {
    this.modalService.closeModal();
    setTimeout(() => {
      this.modalService.openModal('login');
    }, 100);
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      
      const country_code = this.registerForm.value.countryCode;
      const phone = this.registerForm.value.phone;
      const fullPhone = country_code + phone; // For OTP storage
      
      this.authService.register(country_code, phone).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.result) {
            this.toastr.success('تم إرسال رمز التحقق بنجاح', 'نجح', {
              timeOut: 3000,
              positionClass: 'toast-top-center'
            });
            // Store phone data for OTP verification
            this.modalService.setOTPPhone(fullPhone);
            this.modalService.setOTPData(country_code, phone);
            // Close register modal and open OTP modal
            document.body.style.overflow = 'hidden'; // Keep scroll locked for OTP modal
            this.modalService.closeModal();
            setTimeout(() => {
              this.modalService.openModal('otp');
            }, 100);
          } else {
            this.errorMessage = response.message || 'حدث خطأ أثناء إنشاء الحساب';
            this.toastr.error(response.message || 'حدث خطأ أثناء إنشاء الحساب', 'خطأ', {
              timeOut: 3000,
              positionClass: 'toast-top-center'
            });
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.error?.message || 'حدث خطأ أثناء إنشاء الحساب';
          this.toastr.error(error.error?.message || 'حدث خطأ أثناء إنشاء الحساب', 'خطأ', {
            timeOut: 3000,
            positionClass: 'toast-top-center'
          });
        }
      });
    } else {
      this.toastr.warning('يرجى إدخال رقم هاتف صحيح', 'تحذير', {
        timeOut: 3000,
        positionClass: 'toast-top-center'
      });
    }
  }
}
