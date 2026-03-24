import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';

describe('MailService', () => {
  let service: MailService;

  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: '1' }),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'FRONTEND_URL') return 'http://test.com';
      if (key === 'MAIL_FROM') return '"Test" <test@test.com>';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: 'MAIL_TRANSPORTER', useValue: mockTransporter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendResetPasswordEmail', () => {
    it('should call transporter.sendMail', async () => {
      await service.sendResetPasswordEmail('test@test.com', 'token123');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@test.com',
          subject: 'Password Reset Request',
        }),
      );
    });
  });
});
