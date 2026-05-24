import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-booking-confirmation',
  templateUrl: './booking-confirmation.component.html',
  styleUrl: './booking-confirmation.component.scss'
})
export class BookingConfirmationComponent implements OnInit, OnDestroy {
  private originalBodyOverflow: string = '';

  constructor(
    private modalService: ModalService,
    private router: Router
  ) {}

  ngOnInit() {
    // Prevent body scroll when modal is open
    this.originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // Scroll to top to ensure modal is visible
    window.scrollTo(0, 0);
  }

  ngOnDestroy() {
    // Restore body scroll when modal is closed
    document.body.style.overflow = this.originalBodyOverflow;
  }

  closeModal() {
    this.modalService.closeModal();
  }

  goToHome() {
    this.modalService.closeModal();
    this.router.navigate(['/home']);
  }
}
