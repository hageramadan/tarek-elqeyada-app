import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-confirmation-modal',
  templateUrl: './confirmation-modal.component.html',
  styleUrl: './confirmation-modal.component.scss'
})
export class ConfirmationModalComponent {
  @Input() message: string = 'هل أنت متأكد من إلغاء هذا الحجز؟';
  @Input() show: boolean = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
    this.close.emit();
  }

  onClose() {
    this.close.emit();
  }
}
