import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  it('should instantiate and accept email and password properties', () => {
    const dto = new CreateUserDto();
    dto.email = 'test@example.com';
    dto.password = 'securepassword';

    expect(dto).toBeDefined();
    expect(dto.email).toBe('test@example.com');
    expect(dto.password).toBe('securepassword');
  });
});
