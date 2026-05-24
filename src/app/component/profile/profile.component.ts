import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService, User } from '../../services/auth.service';
import { BookingService, Booking } from '../../services/booking.service';
import { ToastrService } from 'ngx-toastr';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  activeTab: 'personal' | 'bookings' = 'personal';
  activeBookingTab: 'current' | 'completed' = 'current';
  currentBookings: Booking[] = [];
  completedBookings: Booking[] = [];
  selectedBooking: Booking | null = null;
  showBookingDetails: boolean = false;
  showExtendBooking: boolean = false;
  user: User | null = null;
  personalInfoForm: FormGroup;
  completeRegistrationForm: FormGroup;
  showCompleteRegistration: boolean = false;
  licenseImageFile: File | null = null;
  licenseImagePreview: string | null = null;
  licenseImageUrl: string | null = null;
  isLoading: boolean = false;
  showSuccessModal: boolean = false;
  showCancelConfirmation: boolean = false;

  constructor(
    private authService: AuthService,
    private bookingService: BookingService,
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private modalService: ModalService
  ) {
    this.personalInfoForm = this.fb.group({
      name: ['', Validators.required],
      phone: ['', Validators.required]
    });

    this.completeRegistrationForm = this.fb.group({
      name: ['', Validators.required],
      phone: ['', Validators.required],
      license_image: [null, Validators.required]
    });
  }

  ngOnInit() {
    this.checkAuth();
    this.loadUserData();
    this.loadBookings();

    // Check if we need to show booking details
    this.route.queryParams.subscribe(params => {
      if (params['bookingId']) {
        this.loadBookingDetails(parseInt(params['bookingId']));
      }
    });
  }

  checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      this.router.navigate(['/home']);
      return;
    }
  }

  loadUserData() {
    const userData = localStorage.getItem('user_data');
    if (userData) {
      try {
        this.user = JSON.parse(userData);
        if (this.user) {
          // Get phone number (with or without country code)
          const phoneNumber = this.user.phone || '';
          const countryCode = this.user.country_code || '';
          const fullPhone = phoneNumber ? (countryCode ? `${countryCode}${phoneNumber}` : phoneNumber) : '';
          
          this.personalInfoForm.patchValue({
            name: this.user.name || '',
            phone: fullPhone || ''
          });

          // Load license image if available
          if (this.user.license_image) {
            this.licenseImageUrl = this.user.license_image;
          }

          // Check if user needs to complete registration
          if (!this.user.phone || !this.user.license_image) {
            this.showCompleteRegistration = true;
            this.completeRegistrationForm.patchValue({
              name: this.user.name || '',
              phone: fullPhone || ''
            });
          }
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }

  loadBookings() {
    this.isLoading = true;
    this.bookingService.getBookings().subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.result && response.data) {
          // Separate current and completed bookings based on status
          const allBookings = response.data.bookings || [];
          this.currentBookings = allBookings.filter((b: Booking) => 
            b.status === 'pending' || b.status === 'confirmed' || b.status === 'ongoing'
          );
          this.completedBookings = allBookings.filter((b: Booking) => 
            b.status === 'completed' || b.status === 'cancelled'
          );
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error loading bookings:', error);
        this.toastr.error('حدث خطأ أثناء تحميل الحجوزات', 'خطأ');
      }
    });
  }

  switchTab(tab: 'personal' | 'bookings') {
    this.activeTab = tab;
    if (tab === 'bookings') {
      this.showBookingDetails = false;
      this.showExtendBooking = false;
      this.selectedBooking = null;
    }
  }

  switchBookingTab(tab: 'current' | 'completed') {
    this.activeBookingTab = tab;
    this.showBookingDetails = false;
    this.showExtendBooking = false;
    this.selectedBooking = null;
  }

  onBookingClick(booking: Booking) {
    this.selectedBooking = booking;
    this.showBookingDetails = true;
    this.showExtendBooking = false;
  }

  goBackToBookings() {
    this.showBookingDetails = false;
    this.showExtendBooking = false;
    this.selectedBooking = null;
  }

  onExtendBooking() {
    if (this.selectedBooking) {
      this.showExtendBooking = true;
      this.showBookingDetails = false;
    }
  }

  onCancelBooking() {
    if (!this.selectedBooking) return;
    this.showCancelConfirmation = true;
  }

  confirmCancelBooking() {
    if (!this.selectedBooking) return;
    
    this.bookingService.cancelBooking(this.selectedBooking.id).subscribe({
      next: (response) => {
        this.showCancelConfirmation = false;
        if (response.result) {
          this.toastr.success('تم إلغاء الحجز بنجاح', 'نجاح');
          this.loadBookings();
          this.goBackToBookings();
        } else {
          this.toastr.error(response.message || 'حدث خطأ أثناء إلغاء الحجز', 'خطأ');
        }
      },
      error: (error) => {
        this.showCancelConfirmation = false;
        console.error('Error cancelling booking:', error);
        this.toastr.error('حدث خطأ أثناء إلغاء الحجز', 'خطأ');
      }
    });
  }

  closeCancelConfirmation() {
    this.showCancelConfirmation = false;
  }

  onLicenseImageSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.licenseImageFile = file;
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.licenseImagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onEditLicenseImage() {
    const fileInput = document.getElementById('license') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  removeLicenseFile() {
    this.licenseImageFile = null;
    const fileInput = document.getElementById('license') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  savePersonalInfo() {
    if (this.personalInfoForm.valid) {
      // Check if license image is required
      if (!this.licenseImageFile && !this.user?.license_image) {
        this.toastr.error('يرجى رفع صورة الرخصة', 'خطأ');
        return;
      }

      const formData = new FormData();
      formData.append('name', this.personalInfoForm.get('name')?.value);
      
      // Extract phone number and country code
      const phoneValue = this.personalInfoForm.get('phone')?.value || '';
      // If phone starts with country code, extract it
      let phone = phoneValue;
      let countryCode = this.user?.country_code || '+966';
      
      // Only append license_image if a new file is selected
      if (this.licenseImageFile) {
        formData.append('license_image', this.licenseImageFile);
      }

      this.isLoading = true;
      this.authService.completeRegistration(formData).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.result && response.data?.user) {
            // Update user data in localStorage
            const updatedUser: any = {
              ...this.user,
              ...response.data.user,
              name: this.personalInfoForm.get('name')?.value,
              phone: phone,
              country_code: countryCode,
              license_image: response.data.user.license_image || this.user?.license_image || this.licenseImageUrl || ''
            };
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
            this.user = updatedUser as User;
            
            // Update license image preview
            if (response.data.user.license_image) {
              this.licenseImageUrl = response.data.user.license_image;
            } else if (this.licenseImageFile) {
              // Create preview from file
              const reader = new FileReader();
              reader.onload = (e: any) => {
                this.licenseImageUrl = e.target.result;
              };
              reader.readAsDataURL(this.licenseImageFile);
            }
            
            this.showSuccessModal = true;
            this.toastr.success('تم حفظ المعلومات بنجاح', 'نجاح');
          } else {
            this.toastr.error(response.message || 'حدث خطأ أثناء حفظ المعلومات', 'خطأ');
          }
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error saving personal info:', error);
          const errorMessage = error.error?.message || error.message || 'حدث خطأ أثناء حفظ المعلومات';
          this.toastr.error(errorMessage, 'خطأ');
        }
      });
    } else {
      this.toastr.error('يرجى ملء جميع الحقول المطلوبة', 'خطأ');
    }
  }

  onSuccessModalClose() {
    this.showSuccessModal = false;
  }

  goToHomeFromModal() {
    this.showSuccessModal = false;
    this.router.navigate(['/home']);
  }

  completeRegistration() {
    if (this.completeRegistrationForm.valid && this.licenseImageFile) {
      const formData = new FormData();
      formData.append('name', this.completeRegistrationForm.get('name')?.value);
      
      // Extract phone number
      const phoneValue = this.completeRegistrationForm.get('phone')?.value || '';
      let phone = phoneValue;
      let countryCode = this.user?.country_code || '+966';
      
      formData.append('license_image', this.licenseImageFile);

      this.isLoading = true;
      this.authService.completeRegistration(formData).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.result && response.data?.user) {
            // Update user data in localStorage
            const updatedUser: any = {
              ...this.user,
              ...response.data.user,
              name: this.completeRegistrationForm.get('name')?.value,
              phone: phone,
              country_code: countryCode,
              license_image: response.data.user.license_image || ''
            };
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
            this.user = updatedUser as User;
            this.licenseImageUrl = response.data.user.license_image || '';
            this.showCompleteRegistration = false;
            this.showSuccessModal = true;
          } else {
            this.toastr.error(response.message || 'حدث خطأ أثناء إكمال التسجيل', 'خطأ');
          }
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error completing registration:', error);
          this.toastr.error('حدث خطأ أثناء إكمال التسجيل', 'خطأ');
        }
      });
    } else {
      this.toastr.error('يرجى ملء جميع الحقول المطلوبة ورفع صورة الرخصة', 'خطأ');
    }
  }

  logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      this.router.navigate(['/home']);
      this.toastr.success('تم تسجيل الخروج بنجاح', 'نجاح');
    }
  }

  loadBookingDetails(bookingId: number) {
    this.bookingService.getBookingById(bookingId).subscribe({
      next: (response) => {
        if (response.result && response.data) {
          this.selectedBooking = response.data as Booking;
          this.showBookingDetails = true;
          this.activeTab = 'bookings';
        }
      },
      error: (error) => {
        console.error('Error loading booking details:', error);
        this.toastr.error('حدث خطأ أثناء تحميل تفاصيل الحجز', 'خطأ');
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    } catch (e) {
      return dateString;
    }
  }

  getBookingPickupTime(booking: Booking): string {
    if (booking.quick_policy?.pickup_within_hour_text) {
      return booking.quick_policy.pickup_within_hour_text;
    }
    return '';
  }

  getBookingKilometers(booking: Booking): string {
    if (booking.quick_policy?.km_limit_text) {
      return booking.quick_policy.km_limit_text;
    }
    return '';
  }

  getBookingDeductible(booking: Booking): string {
    if (booking.quick_policy?.deductible_text) {
      return booking.quick_policy.deductible_text;
    }
    return '';
  }
}
