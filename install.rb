package "vim-enhanced" do
  action :install
end

%w{php mysql-server httpd}.each do |p|
  package p do
    action :install
  end
end

service "httpd" do
  action [:start, :enable]
end
