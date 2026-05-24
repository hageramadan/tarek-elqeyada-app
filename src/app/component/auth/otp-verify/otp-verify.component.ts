import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-otp-verify',
  templateUrl: './otp-verify.component.html',
  styleUrl: './otp-verify.component.scss'
})
export class OtpVerifyComponent implements OnInit, OnDestroy {
  otpForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  phoneNumber = '';
  countryCode = '';
  phone = '';
  timer = 60; // 60 seconds
  timerSubscription?: Subscription;
  canResend = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private modalService: ModalService,
    private toastr: ToastrService
  ) {
    this.otpForm = this.fb.group({
      otp1: ['', [Validators.required, Validators.pattern(/^[0-9]$/)]],
      otp2: ['', [Validators.required, Validators.pattern(/^[0-9]$/)]],
      otp3: ['', [Validators.required, Validators.pattern(/^[0-9]$/)]],
      otp4: ['', [Validators.required, Validators.pattern(/^[0-9]$/)]]
    });
  }

  ngOnInit() {
    this.phoneNumber = this.modalService.getOTPPhone();
    this.countryCode = this.modalService.getOTPCountryCode();
    this.phone = this.modalService.getOTPPhoneNumber();
    this.startTimer();
    // Lock body scroll when modal opens
    document.body.style.overflow = 'hidden';

    // Make OTP entry start from the left box (LTR)
    setTimeout(() => {
      const first = document.getElementById('otp1') as HTMLInputElement | null;
      first?.focus();
    }, 0);
  }

  ngOnDestroy() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    // Unlock body scroll when modal closes
    document.body.style.overflow = '';
  }

  startTimer() {
    this.timer = 60;
    this.canResend = false;
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.timer > 0) {
        this.timer--;
      } else {
        this.canResend = true;
        if (this.timerSubscription) {
          this.timerSubscription.unsubscribe();
        }
      }
    });
  }

  formatTimer(): string {
    const minutes = Math.floor(this.timer / 60);
    const seconds = this.timer % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  onInput(event: any, index: number) {
    const input = event.target;
    const value = input.value;

    // Only allow single digit
    if (value.length > 1) {
      input.value = value.charAt(0);
      this.otpForm.get(`otp${index + 1}`)?.setValue(value.charAt(0));
    }

    // Move to next input if value entered
    if (value && index < 3) {
      const nextInput = document.getElementById(`otp${index + 2}`);
      if (nextInput) {
        nextInput.focus();
      }
    }

    // Auto submit if all fields filled
    if (this.isAllFieldsFilled()) {
      this.onSubmit();
    }
  }

  // index is 0-based (0..3)
  onKeyDown(event: KeyboardEvent, index: number) {
    const target = event.target as HTMLInputElement;

    // Handle backspace: if empty, move to previous box (to the left)
    if (event.key === 'Backspace' && !target.value && index > 0) {
      const prevInput = document.getElementById(`otp${index}`) as HTMLElement | null;
      prevInput?.focus();
      return;
    }

    // Arrow navigation (LTR): left = previous, right = next
    if (event.key === 'ArrowLeft' && index > 0) {
      const prevInput = document.getElementById(`otp${index}`) as HTMLElement | null;
      prevInput?.focus();
      return;
    }
    if (event.key === 'ArrowRight' && index < 3) {
      const nextInput = document.getElementById(`otp${index + 2}`) as HTMLElement | null;
      nextInput?.focus();
      return;
    }

    // Prevent non-numeric input
    if (!/^[0-9]$/.test(event.key) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text').trim();
    
    if (pastedData && /^\d{4}$/.test(pastedData)) {
      for (let i = 0; i < 4; i++) {
        this.otpForm.get(`otp${i + 1}`)?.setValue(pastedData[i]);
      }
      // Focus last input
      const lastInput = document.getElementById('otp4');
      if (lastInput) {
        lastInput.focus();
      }
    }
  }

  isAllFieldsFilled(): boolean {
    return this.otpForm.valid;
  }

  closeModal() {
    document.body.style.overflow = '';
    this.modalService.closeModal();
  }

  resendOTP() {
    if (this.canResend) {
      this.toastr.info('جاري إعادة إرسال رمز التحقق...', 'معلومة', {
        timeOut: 2000,
        positionClass: 'toast-top-center'
      });
      // Resend OTP logic - call register/login again
      this.startTimer();
      // You can add resend API call here if needed
    }
  }

  onSubmit() {
    if (this.otpForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      // Get OTP from form
      const otp = `${this.otpForm.value.otp1}${this.otpForm.value.otp2}${this.otpForm.value.otp3}${this.otpForm.value.otp4}`;
      
      this.authService.verifyOTP(this.countryCode, this.phone, otp).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.result && response.data?.user?.token) {
            
            // Save token to localStorage
            localStorage.setItem('auth_token', response.data.user.token);
            localStorage.setItem('user_data', JSON.stringify(response.data.user));
            
            // this.toastr.success(response.message || 'تم التحقق بنجاح', 'نجح', {
            //   timeOut: 2000,
            //   positionClass: 'toast-top-center'
            // });
            // Execute callback first (before closing modal) to continue booking
            this.modalService.executeOTPVerifiedCallback();
            // Then close OTP modal (this will restore booking modal if it was previous)
            document.body.style.overflow = '';
            // Close modal immediately without delay to prevent loading screen issues
            this.modalService.closeModal();
          } else {
            this.errorMessage = response.message || 'رمز التحقق غير صحيح';
            this.toastr.error(response.message || 'رمز التحقق غير صحيح', 'خطأ', {
              timeOut: 3000,
              positionClass: 'toast-top-center'
            });
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.error?.message || 'حدث خطأ أثناء التحقق';
          this.toastr.error(error.error?.message || 'حدث خطأ أثناء التحقق', 'خطأ', {
            timeOut: 3000,
            positionClass: 'toast-top-center'
          });
        }
      });
    }
  }
}
